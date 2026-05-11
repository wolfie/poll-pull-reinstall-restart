import { spawn as nodeJsSpawn } from 'node:child_process';
import log from './log.mjs';
import _treeKill from 'tree-kill';
import util from 'util';
import kleur from 'kleur';

const treeKill = util.promisify(_treeKill);

/** @typedef {(timeoutMs?:number)=>Promise<void>} KillFn  */

/**
 * @param {import('node:child_process').ChildProcessWithoutNullStreams} child
 * @return {KillFn}
 * */
const createKillFn =
  (child) =>
  async (timeoutMs = 0) => {
    if (child.exitCode !== null)
      return log.info('child process had already exited.');

    log.info('Killing child process');

    const { promise, resolve } =
      /** @type {PromiseWithResolvers<'success'|'timeout'>}*/ (
        Promise.withResolvers()
      );
    child.on('exit', () => resolve('success'));
    setTimeout(() => resolve('timeout'), timeoutMs);

    if (child.pid) {
      await treeKill(child.pid);
    } else {
      child.kill();
    }

    const timeoutResult = await promise;
    if (timeoutMs > 0 && timeoutResult === 'timeout') {
      throw new Error(
        `Child process (PID ${child.pid}) did not die within ${timeoutMs / 1000} second(s)`,
      );
    }
  };

/**
 * @param {string} prefix
 * @param {Buffer} buffer
 */
const prefixWith = (prefix, buffer) =>
  buffer.toString().replace(/(.*)\n/g, `${prefix} $1\n`);

/**
 * @typedef {Object} CustomSpawnOptions
 * @property {boolean} [suppressStdOut]
 * @property {boolean} [captureStdErr]
 */

/**
 * @typedef {import('node:child_process').SpawnOptions & CustomSpawnOptions} SpawnOptions
 */

/**
 * @param {string} processName
 * @param {string[]} [args]
 * @param {SpawnOptions} [opts]
 * @returns {{ child: import('node:child_process').ChildProcessWithoutNullStreams, promise: Promise<number>,kill:KillFn,getStdErr:()=>string }}
 */
const spawn = (processName, args, opts) => {
  /** @type {PromiseWithResolvers<number>} */
  const resolvers = Promise.withResolvers();
  const { resolve, reject, promise } = resolvers;

  const child =
    /** @type {import('node:child_process').ChildProcessWithoutNullStreams} */ (
      nodeJsSpawn(processName, args ?? [], {
        ...opts,
        env: { ...process.env, ...opts?.env },
      })
    );
  child.on('close', resolve);

  const argsString = args && args?.length > 0 ? ' ' + args.join(' ') : '';
  const command = kleur.gray(`${processName}${argsString}`);

  if (!opts?.suppressStdOut) {
    child.stdout.on('data', (buffer) => {
      process.stdout.write(prefixWith(`🔊 [${command}]`, buffer));
    });
  }

  /** @type {Buffer[]} */
  const stdErrChunks = [];
  child.stderr.on('data', (buffer) => {
    if (opts?.captureStdErr) stdErrChunks.push(buffer);
    process.stderr.write(prefixWith(`❗ [${command}]`, buffer));
  });

  child.on('error', (error) => {
    console.error(`🚨 [${command}]`, error);
    reject(error);
  });
  return {
    child,
    promise,
    kill: createKillFn(child),
    getStdErr: () => Buffer.concat(stdErrChunks).toString(),
  };
};

export default spawn;
