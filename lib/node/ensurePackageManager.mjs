import kleur from 'kleur';
import log from '../utils/log.mjs';
import spawn from '../utils/spawn.mjs';
import findExecutable from '../utils/findExecutable.mjs';
import execCorepackEnable from './execCorepackEnable.mjs';

/**
 * Installs corepack globally via npm. Soft: never throws.
 *
 * @returns {Promise<boolean>} true if the install exited cleanly
 */
const installCorepack = async () => {
  log.info(`Running ${kleur.yellow('npm install -g corepack')}`);
  const exitCode = await spawn('npm', [
    'install',
    '-g',
    'corepack',
  ]).promise.catch((error) => {
    log.error('npm install -g corepack failed:', error);
    return -1;
  });
  if (exitCode > 0) {
    log.error(`npm install -g corepack exited with code ${exitCode}`);
  }
  return exitCode === 0;
};

/**
 * @param {import('./getPackageManagerInfo.mjs').PackageManagerInfo['manager']} manager
 * @param {EnsurePackageManagerEnv} env
 */
const logMissing = (manager, env) => {
  log.error(`${kleur.bold(manager)} not found on PATH`);
  if (!env.corepackEnable) {
    log.error(
      `Install ${manager} for the active Node version, or set COREPACK_ENABLE=true`,
    );
  } else if (!env.corepackAutoInstall) {
    log.error(
      `corepack is not available (it is no longer bundled with Node >= 25). Install ${manager} for the active Node version, or set COREPACK_AUTO_INSTALL=true to let pprr run "npm install -g corepack"`,
    );
  } else {
    log.error(
      `Could not provide ${manager} via corepack. Install ${manager} for the active Node version`,
    );
  }
};

/**
 * @typedef {Object} EnsurePackageManagerEnv
 * @property {boolean} corepackEnable
 * @property {boolean} corepackAutoInstall
 */

/**
 * Makes sure the project's package manager binary is on PATH. Call it after
 * any Node version switch and before installing dependencies.
 *
 * - `corepackEnable`: runs `corepack enable` (soft, as before).
 * - `corepackAutoInstall`: if corepack itself is missing (Node >= 25) and the
 *   package manager isn't on PATH, runs `npm install -g corepack` and then
 *   `corepack enable`. npm projects never trigger this, since npm ships with Node.
 *
 * Never throws. Logs an actionable error and returns false if the package
 * manager is still unavailable; the caller decides what that means.
 *
 * @param {import('./getPackageManagerInfo.mjs').PackageManagerInfo} packageManager
 * @param {EnsurePackageManagerEnv} env
 * @returns {Promise<boolean>}
 */
const ensurePackageManager = async ({ manager }, env) => {
  if (env.corepackEnable) {
    const corepackResult = await execCorepackEnable();
    if (
      corepackResult === 'missing' &&
      env.corepackAutoInstall &&
      manager !== 'npm' &&
      !(await findExecutable(manager))
    ) {
      if (await installCorepack()) await execCorepackEnable();
    }
  }

  if (await findExecutable(manager)) return true;
  logMissing(manager, env);
  return false;
};

export default ensurePackageManager;
