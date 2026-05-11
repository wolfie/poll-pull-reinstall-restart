import execFileAsync from '../utils/execFileAsync.mjs';

/**
 * Returns the git repository root for the given directory (defaults to CWD), or
 * undefined if the directory is not inside a git repository.
 *
 * @param {{ cwd?: string }} [opts]
 * @returns {Promise<string | undefined>}
 */

const getGitRepoRoot = async (opts) => {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['rev-parse', '--show-toplevel'],
      {
        encoding: 'utf-8',
        cwd: opts?.cwd,
      },
    );
    return stdout.trim();
  } catch {
    return undefined;
  }
};

export default getGitRepoRoot;
