import log from '../utils/log.mjs';
import execFileAsync from '../utils/execFileAsync.mjs';

// TODO: maybe have this return all git functions upon success?
const assertGitExists = async () =>
  execFileAsync('git', ['--version'])
    .then(() => undefined)
    .catch(() => {
      log.error('There was an issue running `git`');
      process.exit(1);
    });

export default assertGitExists;
