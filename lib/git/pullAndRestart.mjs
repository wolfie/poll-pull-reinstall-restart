import log from '../utils/log.mjs';
import defaultSpawnSerial from '../utils/spawnSerial.mjs';
import defaultExecGitPull from './execGitPull.mjs';
import defaultExecProjectInstall from '../node/execProjectInstall.mjs';
import defaultExecNvm from '../node/execNvm.mjs';
import defaultExecCorepackEnable from '../node/execCorepackEnable.mjs';
import kleur from 'kleur';

/**
 * @typedef {Object} PullAndRestartDeps
 * @property {typeof defaultExecGitPull} [execGitPull]
 * @property {typeof defaultExecProjectInstall} [execProjectInstall]
 * @property {typeof defaultExecNvm} [execNvm]
 * @property {typeof defaultExecCorepackEnable} [execCorepackEnable]
 * @property {typeof defaultSpawnSerial} [spawnSerial]
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
        return;
      }

      const isFirstRun = !spawnSerialResult;
      if (!isFirstRun && !pullResult.changed) return;

      if (spawnSerialResult) {
        await spawnSerialResult.killAll(1000);
      }

      if (!isFirstRun) {
        if (env.nvmAutoInstall) await execNvm();
        if (env.corepackEnable) await execCorepackEnable();
        await execProjectInstall(packageManager, env.installDevPkgs);
      }

      spawnSerialResult = spawnSerial(packageManager, env.restartScripts);
      // A restart script failing shouldn't crash the polling daemon — the
      // next poll cycle will either pick up a fix or surface the same error.
      spawnSerialResult.promise.catch((error) => {
        log.error('Restart scripts failed:', error);
      });
    } finally {
      locked = false;
    }
  };
};

export default createPullAndRestart;
