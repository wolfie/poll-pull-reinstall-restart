import kleur from 'kleur';
import log from './log.mjs';
import spawn from './spawn.mjs';

/**
 * @typedef {Object} SpawnSerialResult
 * @property {()=>(import("node:child_process").ChildProcessWithoutNullStreams | undefined)} getCurrentChild
 * @property {Promise<unknown>} promise
 * @property {(timeoutMs?:number)=>Promise<void>} killAll
 */

/**
 *
 * @param {import('../node/getPackageManagerInfo.mjs').PackageManagerInfo} packageManagerInfo
 * @param {string[]} scripts
 * @param {import('./spawn.mjs').SpawnOptions} [opts]
 * @returns {SpawnSerialResult}
 */
const spawnSerial = (packageManagerInfo, scripts, opts) => {
  /** @type {PromiseWithResolvers<void>} */
  const { promise, reject, resolve } = Promise.withResolvers();
  let killed = false;

  /** @type {{current:import("node:child_process").ChildProcessWithoutNullStreams|undefined}} */
  let child = { current: undefined };
  /** @type {{current:SpawnSerialResult['killAll']|undefined}} */
  let killFn = { current: undefined };

  /** @param {Error} [error] */
  const finish = (error) => {
    child.current = undefined;
    killFn.current = undefined;
    if (error) reject(error);
    else resolve();
  };

  const runScript = async (i = 0) => {
    if (killed) return finish();
    const script = scripts.at(i);
    if (!script) return finish();

    const packageManager = packageManagerInfo.manager;
    const runArg = packageManagerInfo.runArg;
    log.info(
      `Executing: ${kleur.yellow(`${packageManager} ${runArg} ${script}`)}`,
    );
    const result = spawn(packageManager, [runArg, script], opts);
    killFn.current = result.kill;
    child.current = result.child;

    /** @type {number | undefined} */
    let exitCode;
    try {
      exitCode = await result.promise;
    } catch (error) {
      // killAll triggers a child rejection via the kill signal; that's a
      // clean stop, not a script failure.
      if (killed) return finish();
      killed = true;
      return finish(/** @type {Error} */ (error));
    }

    if (killed) return finish();

    if (exitCode !== 0) {
      killed = true;
      return finish(
        new Error(`Script "${script}" exited with code ${exitCode}`),
      );
    }

    void runScript(i + 1);
  };

  runScript(0);

  /** @type {SpawnSerialResult['killAll']} */
  const killAll = async (timeout) => {
    killed = true;
    if (killFn.current) {
      if (child.current) {
        log.verbose(
          `Killing process with PID ${child.current?.pid ?? '[unknown]'}`,
        );
      } else {
        log.info(`Warning: killing process, but no child found`);
      }
      await killFn.current(timeout);
    }
  };

  /** @type {SpawnSerialResult['getCurrentChild']} */
  const getCurrentChild = () => child.current;

  return {
    promise,
    killAll,
    getCurrentChild,
  };
};

export default spawnSerial;
