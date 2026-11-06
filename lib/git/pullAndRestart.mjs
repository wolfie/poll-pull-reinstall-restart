import log from '../utils/log.mjs';
import defaultNotify from '../utils/notify.mjs';
import defaultSpawnSerial from '../utils/spawnSerial.mjs';
import defaultExecGitPull from './execGitPull.mjs';
import defaultExecProjectInstall from '../node/execProjectInstall.mjs';
import defaultExecNvm from '../node/execNvm.mjs';
import defaultEnsurePackageManager from '../node/ensurePackageManager.mjs';
import kleur from 'kleur';
import pluralize from '../utils/pluralize.mjs';

/**
 * @typedef {Object} PullAndRestartDeps
 * @property {typeof defaultExecGitPull} [execGitPull]
 * @property {typeof defaultExecProjectInstall} [execProjectInstall]
 * @property {typeof defaultExecNvm} [execNvm]
 * @property {typeof defaultEnsurePackageManager} [ensurePackageManager]
 * @property {typeof defaultSpawnSerial} [spawnSerial]
 * @property {typeof defaultNotify} [notify]
 */

/**
 * Builds a pull-and-restart function that holds its own state (lock and the
 * currently-running spawn). The returned function is safe to schedule on a
 * timer: concurrent invocations short-circuit until the previous one finishes.
 *
 * @param {PullAndRestartDeps} [deps]
 */
const createPullAndRestart = (deps = {}) => {
  const execGitPull = deps.execGitPull ?? defaultExecGitPull;
  const execProjectInstall =
    deps.execProjectInstall ?? defaultExecProjectInstall;
  const execNvm = deps.execNvm ?? defaultExecNvm;
  const ensurePackageManager =
    deps.ensurePackageManager ?? defaultEnsurePackageManager;
  const spawnSerial = deps.spawnSerial ?? defaultSpawnSerial;
  const notify = deps.notify ?? defaultNotify;

  let locked = false;
  let hasStarted = false;
  // Set when a reinstall failed. The next tick retries even without new
  // upstream changes, since the old scripts have already been killed.
  let installPending = false;
  /** @type {import('../utils/spawnSerial.mjs').SpawnSerialResult | undefined} */
  let spawnSerialResult;
  let consecutivePullFailures = 0;

  /**
   * @param {import('../getEnv.mjs').Env} env
   * @param {import('../node/getPackageManagerInfo.mjs').PackageManagerInfo} packageManager
   */
  return async (env, packageManager) => {
    if (locked) {
      log.info(kleur.yellow('Skipping restart, old restart is still active'));
      return;
    }

    locked = true;
    try {
      const pullResult = await execGitPull(env.sshKeyPath);
      if (!pullResult.success) {
        consecutivePullFailures++;
        log.error('Could not pull repository');
        // GitHub has a relatively high chance of a transient pull failure —
        // only notify once failures happen on two consecutive polls.
        if (consecutivePullFailures >= 2) {
          notify(env, { title: 'Git pull failed' });
        }
        return;
      }
      consecutivePullFailures = 0;

      const isFirstRun = !hasStarted;
      if (!isFirstRun && !pullResult.changed && !installPending) return;

      if (spawnSerialResult) {
        notify(env, { title: 'Update detected, restarting' });
        await spawnSerialResult.killAll(1000);
        spawnSerialResult = undefined;
      } else if (installPending) {
        log.info('Retrying dependency install');
      }

      if (!isFirstRun) {
        if (env.nvmAutoInstall) await execNvm();
        const failure = !(await ensurePackageManager(packageManager, env))
          ? `${packageManager.manager} not found`
          : await execProjectInstall(packageManager, env.installDevPkgs).then(
              (exitCode) =>
                exitCode === 0
                  ? undefined
                  : `${packageManager.manager} install exited with code ${exitCode}`,
            );
        if (failure) {
          log.error(
            `${failure}; restart scripts not started, retrying on next poll`,
          );
          // Notify once per outage, not on every retry tick.
          if (!installPending) {
            notify(env, { title: 'Install failed', body: failure });
          }
          installPending = true;
          return;
        }
        installPending = false;
      }

      spawnSerialResult = spawnSerial(packageManager, env.restartScripts);
      hasStarted = true;
      if (isFirstRun) {
        notify(env, {
          title: 'Service started',
          body: `${pluralize('Script', env.restartScripts.length)} ran: ${env.restartScripts.join(', ')}`,
        });
      }
      // A restart script failing shouldn't crash the polling daemon — the
      // next poll cycle will either pick up a fix or surface the same error.
      spawnSerialResult.promise.catch((error) => {
        log.error('Restart scripts failed:', error);
        notify(env, {
          title: 'Restart scripts failed',
          body: /** @type {Error} */ (error).message,
        });
      });
    } finally {
      locked = false;
    }
  };
};

export default createPullAndRestart;
