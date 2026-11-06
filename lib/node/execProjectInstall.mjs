import kleur from 'kleur';
import log from '../utils/log.mjs';
import spawn from '../utils/spawn.mjs';

/**
 * Installs project dependencies. Never throws: a spawn error (e.g. ENOENT
 * because the package manager isn't on PATH) is logged and reported as -1.
 *
 * @param {import('./getPackageManagerInfo.mjs').PackageManagerInfo} packageManager
 * @param {boolean} installDevDeps
 * @returns {Promise<number>} exit code; 0 on success
 */
const execProjectInstall = async (packageManager, installDevDeps) => {
  const args = installDevDeps
    ? packageManager.args
    : [...packageManager.args, packageManager.prodArg];
  const command = `${packageManager.manager} ${args.join(' ')}`;
  log.info(`Executing: ${kleur.yellow(command)}`);
  const exitCode = await spawn(packageManager.manager, args).promise.catch(
    (error) => {
      log.error(`${command} failed:`, error);
      return -1;
    },
  );
  if (exitCode !== 0) log.error(`${command} exited with code ${exitCode}`);
  return exitCode ?? -1;
};

export default execProjectInstall;
