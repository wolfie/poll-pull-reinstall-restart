import path from 'node:path';
import assertGitExists from './git/assertGitExists.mjs';
import getGitRepoRoot from './git/getGitRepoRoot.mjs';
import orderedCheckbox, { Separator } from './inquirer/orderedCheckbox.mjs';
import log from './utils/log.mjs';
import getScripts from './node/getScripts.mjs';
import os from 'node:os';
import fs, { constants } from 'node:fs/promises';
import cloneProject from './git/cloneProject.mjs';
import getKeyPathInteractively from './ssh/getKeyPathInteractively.mjs';
import number from '@inquirer/number';
import input from '@inquirer/input';
import confirm from '@inquirer/confirm';
import isNegative from './utils/isNegative.mjs';
import splitEnvVarArray from './utils/splitEnvVarArray.mjs';
import getWords from './getWords.mjs';

/**
 * @returns {Promise<boolean>} true if nvm.sh is found on this machine
 */
const isNvmInstalled = async () => {
  const nvmDir = process.env['NVM_DIR'] ?? path.join(os.homedir(), '.nvm');
  return fs
    .access(path.join(nvmDir, 'nvm.sh'))
    .then(() => true)
    .catch(() => false);
};

/** @param {string} repoRoot  */
const nvmrcExists = async (repoRoot) =>
  await fs
    .access(path.join(repoRoot, '.nvmrc'))
    .then(() => true)
    .catch(() => false);

/**
 * @param {string} message
 * @param {string[]} scriptChoices
 * @param {string[]} preselected
 */
const scriptCheckboxes = async (message, scriptChoices, preselected) => {
  /** @type {(string|Separator)[]} */
  const choices = [...scriptChoices];
  const notMatching = preselected.filter((script) => !choices.includes(script));

  if (notMatching.length > 0) {
    choices.push(new Separator());
    choices.push(...notMatching);
  }

  return await orderedCheckbox({ choices, default: preselected, message });
};

/**
 * @param {{url?:string,targetPath?:string,isInteractive:boolean}} arg
 */
const init = async ({ url, targetPath, isInteractive }) => {
  await assertGitExists();
  /** @type {string} */
  let repoRoot;
  if (url) {
    repoRoot = await cloneProject({ url, targetPath, isInteractive });
    if (repoRoot !== process.cwd()) {
      log.verbose(`Changing working directory to ${repoRoot}`);
      process.chdir(repoRoot);
    }
  } else {
    const $repoRoot = await getGitRepoRoot();
    if (!$repoRoot) {
      log.error(
        `Cannot run init outside of a git repository, cwd: ${process.cwd()}`,
      );
      process.exit(1);
    }
    repoRoot = $repoRoot;
  }

  const pprrcPath = path.resolve(repoRoot, '.pprrc');
  /** @type {{success:true,exists:boolean}|{success:false,error:unknown}} */
  const pprrcExistsResult = await fs
    .stat(pprrcPath)
    .then(() => /** @type {const} */ ({ success: true, exists: true }))
    .catch((error) =>
      error.code === 'ENOENT'
        ? { success: true, exists: false }
        : { success: false, error },
    );

  if (!pprrcExistsResult.success) {
    log.error(`Could not analyze status of ${pprrcPath}:`);
    log.error(pprrcExistsResult.error);
    process.exit(1);
  }

  if (pprrcExistsResult.exists) {
    log.error(`Refusing to overwrite existing ${pprrcPath}. Exiting.`);
    process.exit(1);
  }

  const pprrcCreationError = await fs
    .access(repoRoot, constants.W_OK)
    .then(() => undefined)
    .catch((error) => error);
  if (pprrcCreationError) {
    log.error(`${repoRoot} is not writable, cannot create a .pprrc`);
    log.error(pprrcCreationError);
    process.exit(1);
  }

  let restartScripts = splitEnvVarArray('RESTART_SCRIPTS');
  let onceScripts = splitEnvVarArray('ONCE_SCRIPTS');
  let sshKeyPath = process.env['SSH_KEY_PATH'];
  let installDevPkgs = !isNegative(process.env['INSTALL_DEV_PKGS']);
  let pollInterval = parseInt(process.env['POLL_INTERVAL'] ?? '60', 10);
  let nvmAutoInstall =
    process.env['NVM_AUTO_INSTALL'] == null ||
    !isNegative(process.env['NVM_AUTO_INSTALL']);
  let corepackEnable =
    process.env['COREPACK_ENABLE'] == null ||
    !isNegative(process.env['COREPACK_ENABLE']);
  let serviceName = process.env['SERVICE_NAME'];
  let ntfyTopic = process.env['NTFY_TOPIC'];
  let ntfyServer = process.env['NTFY_SERVER'];

  if (isInteractive) {
    const scriptChoices = Object.keys(await getScripts());
    restartScripts = await scriptCheckboxes(
      'Restart scripts',
      scriptChoices,
      restartScripts,
    );
    onceScripts = await scriptCheckboxes(
      'Once scripts',
      scriptChoices,
      onceScripts,
    );
    sshKeyPath = await getKeyPathInteractively({
      allowNone: true,
      default: sshKeyPath,
    });
    installDevPkgs = await confirm({
      message: 'Install devDependencies',
      default: false,
    });
    pollInterval = await number({
      message: 'Poll interval (seconds)',
      default: pollInterval,
      required: true,
      step: 30,
      min: 30,
    });

    if (await nvmrcExists(repoRoot)) {
      if (await isNvmInstalled()) {
        nvmAutoInstall = await confirm({
          message: 'Auto-install Node versions via nvm when .nvmrc changes',
          default: true,
        });
      } else {
        const continueRegardless = await confirm({
          message:
            'nvm not found on this machine. Do you want to continue without installing it first?',
          default: false,
        });
        if (!continueRegardless) process.exit(0);
      }
    }
    corepackEnable = await confirm({
      message: 'Run corepack enable after each Node version switch',
      default: true,
    });

    const pkgName = await fs
      .readFile(path.join(repoRoot, 'package.json'), 'utf-8')
      .then((raw) => JSON.parse(raw).name ?? '')
      .catch(() => '');

    const enableNtfy = await confirm({
      message: 'Enable ntfy notifications',
      default: !!ntfyTopic,
    });

    if (enableNtfy) {
      const rawServiceName = await input({
        message: 'Service name',
        default: serviceName ?? pkgName,
      });
      serviceName = rawServiceName.trim() || undefined;
      const rawNtfyTopic = await input({
        message: 'ntfy topic',
        default:
          ntfyTopic ?? (await getWords(3).then((words) => words.join('-'))),
      });
      ntfyTopic = rawNtfyTopic.trim() || undefined;
      const rawServer = await input({
        message: 'ntfy server URL',
        default: ntfyServer ?? 'https://ntfy.sh',
      });
      ntfyServer = rawServer.trim() || undefined;
    } else {
      serviceName = undefined;
      ntfyTopic = undefined;
      ntfyServer = undefined;
    }
  }

  const pprrcContents = [
    `RESTART_SCRIPTS=${restartScripts.join(',')}`,
    `${onceScripts.length === 0 ? '# ' : ''}ONCE_SCRIPTS=${onceScripts.join(',')}`,
    `${!sshKeyPath ? '# ' : ''}SSH_KEY_PATH=${sshKeyPath ?? ''}`,
    `INSTALL_DEV_PKGS=${installDevPkgs}`,
    `${pollInterval === 60 ? '# ' : ''}POLL_INTERVAL=${pollInterval}`,
    `NVM_AUTO_INSTALL=${nvmAutoInstall}`,
    `COREPACK_ENABLE=${corepackEnable}`,
    `${!serviceName ? '# ' : ''}SERVICE_NAME=${serviceName ?? ''}`,
    `${!ntfyTopic ? '# ' : ''}NTFY_TOPIC=${ntfyTopic ?? ''}`,
    `${!ntfyServer ? '# ' : ''}NTFY_SERVER=${ntfyServer ?? ''}`,
  ].map((x) => x + os.EOL);

  log.verbose(`Writing to ${path.resolve(repoRoot, '.pprrc')}:`);
  log.verbose(pprrcContents);

  await fs.writeFile(pprrcPath, pprrcContents, 'utf-8');
};

export default init;
