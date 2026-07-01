import spawn from '../utils/spawn.mjs';
import log from '../utils/log.mjs';
import kleur from 'kleur';

const execCorepackEnable = async () => {
  log.info(`Running ${kleur.yellow('corepack enable')}`);
  const exitCode = await spawn('corepack', ['enable']).promise.catch(
    (/** @type {NodeJS.ErrnoException} */ error) => {
      if (error.code === 'ENOENT') {
        log.error('corepack not found — skipping (requires Node >= 16.9)');
      } else {
        log.error('corepack enable failed:', error);
      }
      return -1;
    },
  );
  if (exitCode > 0) {
    log.error(`corepack enable exited with code ${exitCode}`);
  }
};

export default execCorepackEnable;
