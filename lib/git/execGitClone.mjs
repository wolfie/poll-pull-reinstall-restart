import kleur from 'kleur';
import log from '../utils/log.mjs';
import spawn from '../utils/spawn.mjs';
import buildGitSshCommand from './buildGitSshCommand.mjs';

/**
 * @param {string} repoUrl
 * @param {string} cloneTargetPath
 * @param {string|undefined} sshKeyPath
 * @returns {Promise<{success:true}|{success:false,authError:boolean,stdErr:string}>}
 */
const execGitClone = async (repoUrl, cloneTargetPath, sshKeyPath) => {
  const GIT_SSH_COMMAND = sshKeyPath
    ? await buildGitSshCommand(sshKeyPath)
    : undefined;

  if (sshKeyPath) log.verbose(`Using SSH key ${kleur.yellow(sshKeyPath)}`);
  else log.verbose('No SSH key configured');
  log.verbose(
    `Executing: ${kleur.yellow(`git clone ${repoUrl} ${cloneTargetPath}`)}`,
  );
  const spawnResult = spawn('git', ['clone', repoUrl, cloneTargetPath], {
    captureStdErr: true,
    env: {
      ...(GIT_SSH_COMMAND && { GIT_SSH_COMMAND }),
    },
  });

  const exitCode = await spawnResult.promise.catch(() => 1);
  if (exitCode === 0) return { success: true };

  const stderr = spawnResult.getStdErr();
  const authError =
    // SSH
    stderr.includes('Permission denied (publickey)') ||
    stderr.includes('No supported authentication methods available') ||
    // GitHub/GitLab mask private-repo-not-accessible as "not found" to avoid leaking existence
    stderr.includes('Repository not found') ||
    stderr.includes('Project not found') ||
    stderr.includes('correct access rights') ||
    // HTTPS
    stderr.includes('Authentication failed for') ||
    stderr.includes('Invalid username or password') ||
    stderr.includes('HTTP Basic: Access denied') ||
    stderr.includes('returned error: 401');
  return { success: false, authError, stdErr: stderr };
};

export default execGitClone;
