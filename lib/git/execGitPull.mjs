import spawn from '../utils/spawn.mjs';
import execFileAsync from '../utils/execFileAsync.mjs';
import buildGitSshCommand from './buildGitSshCommand.mjs';

/**
 * @param {string|undefined} sshKeyPath
 * @returns {Promise<{success:false}|{success:true,changed:boolean}>}
 */
const execGitPull = async (sshKeyPath) => {
  const GIT_SSH_COMMAND = sshKeyPath
    ? await buildGitSshCommand(sshKeyPath)
    : undefined;

  const env = {
    ...(GIT_SSH_COMMAND && { GIT_SSH_COMMAND }),
  };

  const { stdout: headBefore } = await execFileAsync('git', [
    'rev-parse',
    'HEAD',
  ]);

  const exitCode = await spawn('git', ['pull'], {
    env,
    suppressStdOut: true,
  }).promise.catch(() => 1);
  if (exitCode !== 0) return { success: false };

  const { stdout: headAfter } = await execFileAsync('git', [
    'rev-parse',
    'HEAD',
  ]);
  return { success: true, changed: headBefore.trim() !== headAfter.trim() };
};

export default execGitPull;
