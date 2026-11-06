import spawn from '../utils/spawn.mjs';
import log from '../utils/log.mjs';
import kleur from 'kleur';

/**
 * Runs `corepack enable`. Always soft: never throws.
 *
 * `'missing'` means there is no `corepack` binary on PATH, which is normal on
 * Node >= 25 (corepack is no longer bundled).
 *
 * @returns {Promise<'ok'|'missing'|'failed'>}
 */
const execCorepackEnable = async () => {
  log.info(`Running ${kleur.yellow('corepack enable')}`);
  const exitCode = await spawn('corepack', ['enable']).promise.catch(
    (/** @type {NodeJS.ErrnoException} */ error) => {
      if (error.code === 'ENOENT') return /** @type {const} */ ('missing');
      log.error('corepack enable failed:', error);
      return -1;
    },
  );
  if (exitCode === 'missing') {
    log.info('corepack not found — skipping corepack enable');
    return 'missing';
  }
  if (exitCode !== 0) {
    if (exitCode > 0) log.error(`corepack enable exited with code ${exitCode}`);
    return 'failed';
  }
  return 'ok';
};

export default execCorepackEnable;
