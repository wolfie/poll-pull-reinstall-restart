import log from '../utils/log.mjs';
import defaultNotify from '../utils/notify.mjs';
import defaultSpawnSerial from '../utils/spawnSerial.mjs';
import defaultExecGitPull from './execGitPull.mjs';
import defaultExecProjectInstall from '../node/execProjectInstall.mjs';
import defaultExecNvm from '../node/execNvm.mjs';
import defaultExecCorepackEnable from '../node/execCorepackEnable.mjs';
import kleur from 'kleur';
import pluralize from '../utils/pluralize.mjs';

/**
 * @typedef {Object} PullAndRestartDeps
 * @property {typeof defaultExecGitPull} [execGitPull]
 * @property {typeof defaultExecProjectInstall} [execProjectInstall]
 * @property {typeof defaultExecNvm} [execNvm]
 * @property {typeof defaultExecCorepackEnable} [execCorepackEnable]
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
  const execCorepackEnable =
    deps.execCorepackEnable ?? defaultExecCorepackEnable;
  const spawnSerial = deps.spawnSerial ?? defaultSpawnSerial;
  const notify = deps.notify ?? defaultNotify;

  let locked = false;
  /** @type {import('../utils/spawnSerial.mjs').SpawnSerialResult | undefined} */
  let spawnSerialResult;

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
        log.error('Could not pull repository');
        notify(env, { title: 'Git pull failed' });
        return;
      }

      const isFirstRun = !spawnSerialResult;
      if (!isFirstRun && !pullResult.changed) return;

      if (spawnSerialResult) {
        notify(env, { title: 'Update detected, restarting' });
        await spawnSerialResult.killAll(1000);
      }

      if (!isFirstRun) {
        if (env.nvmAutoInstall) await execNvm();
        if (env.corepackEnable) await execCorepackEnable();
        await execProjectInstall(packageManager, env.installDevPkgs);
      }

      spawnSerialResult = spawnSerial(packageManager, env.restartScripts);
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
