import { access, stat, constants } from 'node:fs/promises';
import path from 'node:path';

/** @param {string} candidate */
const isExecutableFile = async (candidate) => {
  try {
    const stats = await stat(candidate);
    if (!stats.isFile()) return false;
    await access(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

/**
 * Looks up an executable on `process.env.PATH` without running it.
 *
 * @param {string} name
 * @returns {Promise<string|null>} absolute path to the executable, or null if not found
 */
const findExecutable = async (name) => {
  const dirs = (process.env['PATH'] ?? '')
    .split(path.delimiter)
    .filter(Boolean);
  const extensions =
    process.platform === 'win32'
      ? ['', ...(process.env['PATHEXT'] ?? '.EXE;.CMD;.BAT').split(';')]
      : [''];

  for (const dir of dirs) {
    for (const ext of extensions) {
      const candidate = path.join(dir, name + ext);
      if (await isExecutableFile(candidate)) return candidate;
    }
  }
  return null;
};

export default findExecutable;
