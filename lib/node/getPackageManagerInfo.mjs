import fs from 'fs/promises';
import log from '../utils/log.mjs';
import kleur from 'kleur';

/**
 * @typedef {Object} PackageManagerInfo
 * @property {'pnpm'|'yarn'|'npm'} manager
 * @property {string[]} args
 * @property {string} prodArg
 * @property {string} runArg
 */

/**
 * @returns {Promise<PackageManagerInfo>}
 */
const getPackageManagerInfo = async () => {
  const dir = await fs.readdir(process.cwd());
  /** @type {(PackageManagerInfo)[]} */
  const result = [];
  if (dir.includes('pnpm-lock.yaml'))
    result.push({
      manager: 'pnpm',
      args: ['i', '--frozen-lockfile'],
      prodArg: '--prod',
      runArg: 'run',
    });
  if (dir.includes('package-lock.json'))
    result.push({
      manager: 'npm',
      args: ['ci'],
      prodArg: '--production',
      runArg: 'run',
    });
  if (dir.includes('yarn.lock'))
    result.push({
      manager: 'yarn',
      args: ['i', '--frozen-lockfile'],
      prodArg: '--production',
      runArg: 'run',
    });

  if (result.length === 0) {
    log.error("Couldn't detect any package managers");
    process.exit(1);
  }
  if (result.length > 1) {
    log.error('Detected too many package managers');
    log.error(kleur.bold().yellow(JSON.stringify(result)));
    process.exit(1);
  }

  const info = result[0];
  log.verbose(`Detected package manager: ${kleur.bold().yellow(info.manager)}`);
  return info;
};

export default getPackageManagerInfo;
