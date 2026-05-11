import log from '../utils/log.mjs';
import execFileAsync from '../utils/execFileAsync.mjs';

/** @type {'unchecked'|'exists'} */
let sshExists = 'unchecked';
const assertSshExists = async () => {
  if (sshExists !== 'unchecked') return;

  const success = await execFileAsync('ssh', ['-V'])
    .then(() => true)
    .catch(() => false);

  if (success) {
    sshExists = 'exists';
  } else {
    log.error(
      'command `ssh` does not exist, cannot use inline command to send deploy key. Try configuring your ssh config file',
    );
    log.error(
      'see: https://www.man7.org/linux/man-pages/man5/ssh_config.5.html',
    );
    process.exit(1);
  }
};

/**
 * @param {string} sshKeyPath
 * @returns {Promise<string>}
 */
const buildGitSshCommand = async (sshKeyPath) => {
  await assertSshExists();
  return `ssh -i ${sshKeyPath} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new`;
};

export default buildGitSshCommand;
