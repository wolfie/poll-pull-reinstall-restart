import kleur from 'kleur';
import log from '../utils/log.mjs';
import spawn from '../utils/spawn.mjs';

/**
 * @param {import('./getPackageManagerInfo.mjs').PackageManagerInfo} packageManager
 * @param {boolean} installDevDeps
 */
const execProjectInstall = async (packageManager, installDevDeps) => {
  const args = installDevDeps
    ? packageManager.args
    : [...packageManager.args, packageManager.prodArg];
  log.info(
    `Executing: ${kleur.yellow(`${packageManager.manager} ${args.join(' ')}`)}`,
  );
  return spawn(packageManager.manager, args).promise;
};

export default execProjectInstall;
