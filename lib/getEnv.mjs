import { configDotenv } from 'dotenv';
import path from 'node:path';
import fs from 'fs/promises';
import log from './utils/log.mjs';
import kleur from 'kleur';
import isNegative from './utils/isNegative.mjs';
import splitEnvVarArray from './utils/splitEnvVarArray.mjs';

/**
 * @typedef {Awaited<ReturnType<typeof getEnv>>} Env
 */

const getEnv = async () => {
  const pprrcPath = path.resolve(process.cwd(), '.pprrc');

  /** @type {{found:boolean}|{error:unknown}} */
  const pathResult = await fs
    .stat(pprrcPath)
    .then(() => ({ found: true }))
    .catch((error) => (error.code === 'ENOENT' ? { found: false } : { error }));

  if ('error' in pathResult) {
    log.error(`Cannot access ${pprrcPath}:`, pathResult.error);
    process.exit(1);
  }

  const pprrcExists = pathResult.found;
  log.verbose(
    `${pprrcPath} ${pprrcExists ? kleur.green('found') : kleur.yellow('missing')}`,
  );

  if (pprrcExists) {
    const { error } = configDotenv({ path: pprrcPath, quiet: true });
    if (error) {
      log.error(error);
      process.exit(1);
    }
  }

  const restartScripts = splitEnvVarArray('RESTART_SCRIPTS');
  if (restartScripts.length === 0) {
    log.error(
      'RESTART_SCRIPTS not set. Pass as environment variable, or create a .pprrc with --init',
    );
    process.exit(1);
  }
  const onceScripts = splitEnvVarArray('ONCE_SCRIPTS');
  const sshKeyPath = process.env['SSH_KEY_PATH'];
  const installDevPkgs = !isNegative(process.env['INSTALL_DEV_PKGS']);
  const $pollInterval = parseInt(process.env['POLL_INTERVAL'] ?? '60', 10);
  const pollInterval = Number.isNaN($pollInterval) ? 60 : $pollInterval;
  const nvmAutoInstall =
    process.env['NVM_AUTO_INSTALL'] == null ||
    !isNegative(process.env['NVM_AUTO_INSTALL']);
  const corepackEnable =
    process.env['COREPACK_ENABLE'] == null ||
    !isNegative(process.env['COREPACK_ENABLE']);
  const serviceName = process.env['SERVICE_NAME'];
  const ntfyTopic = process.env['NTFY_TOPIC'];
  const ntfyServer = process.env['NTFY_SERVER'];

  log.verbose(
    `Env:\n${JSON.stringify(
      {
        restartScripts,
        onceScripts,
        sshKeyPath,
        installDevPkgs,
        pollInterval,
        nvmAutoInstall,
        corepackEnable,
        serviceName,
        ntfyTopic,
        ntfyServer,
      },
      null,
      2,
    )}`,
  );

  return {
    restartScripts,
    onceScripts,
    sshKeyPath,
    installDevPkgs,
    pollInterval,
    nvmAutoInstall,
    corepackEnable,
    serviceName,
    ntfyTopic,
    ntfyServer,
  };
};

export default getEnv;
