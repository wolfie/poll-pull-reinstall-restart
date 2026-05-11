import path from 'node:path';
import log from '../utils/log.mjs';
import getGitRepoRoot from './getGitRepoRoot.mjs';
import input from '@inquirer/input';
import execGitClone from './execGitClone.mjs';
import getKeyPathInteractively from '../ssh/getKeyPathInteractively.mjs';

/**
 * @param {{url:string,targetPath?:string,isInteractive:boolean}} args
 */
const cloneProject = async ({ url, targetPath, isInteractive }) => {
  const gitRepoRoot = await getGitRepoRoot();
  if (gitRepoRoot) {
    log.error(`Already in a Git repo (${gitRepoRoot})`);
    log.error(`cannot initialize new repository from remote ${url}`);
    process.exit(1);
  }

  let repoTargetPath =
    targetPath || path.basename(url.replace(/.git$/, '').replace(/[:/]$/, ''));
  if (isInteractive) {
    repoTargetPath = await input({
      message: 'Clone target',
      default: repoTargetPath,
    });
  }

  let retry = false;
  let sshKeyPath = process.env.SSH_KEY_PATH;
  do {
    retry = false;
    const cloneResult = await execGitClone(url, repoTargetPath, sshKeyPath);
    if (cloneResult.success) break;

    if (cloneResult.authError) {
      const isHttpOrHttps = /^https?:\/\//.test(url);
      if (isHttpOrHttps) {
        log.error(
          'Failed to authenticate cloning the repository, and no recovery found for http/https repository',
        );
        log.error(cloneResult.stdErr);
        process.exit(1);
      } else if (isInteractive) {
        sshKeyPath = await getKeyPathInteractively();
        retry = true;
      } else {
        log.error('Failed to authenticate cloning the repository');
        log.error(cloneResult.stdErr);
        process.exit(1);
      }
    } else {
      log.error('Error while cloning the repository');
      process.exit(1);
    }
  } while (retry);

  if (sshKeyPath) process.env.SSH_KEY_PATH = sshKeyPath;
  else delete process.env.SSH_KEY_PATH;

  return path.resolve(repoTargetPath);
};

export default cloneProject;
