import select from '@inquirer/select';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import assertSshKeygenExists from './assertSshKeygenExists.mjs';
import execFileAsync from '../utils/execFileAsync.mjs';
import log from '../utils/log.mjs';

/** @returns {Promise<string[]>} paths to private keys (paired with a .pub file) */
const getSshKeys = async () => {
  const sshDir = path.join(os.homedir(), '.ssh');
  try {
    const files = await fs.readdir(sshDir);
    return files
      .filter((f) => f.endsWith('.pub'))
      .map((f) => path.join(sshDir, f.slice(0, -4)));
  } catch {
    return [];
  }
};

/**
 * Returns a filesystem-safe slug from the project name in package.json (or
 * the directory name if package.json is absent or has no name field).
 *
 * @param {string} [cwd]
 * @returns {Promise<string>}
 */
export const getProjectSlug = async (cwd = process.cwd()) => {
  try {
    const raw = JSON.parse(
      await fs.readFile(path.join(cwd, 'package.json'), 'utf-8'),
    ).name;
    if (raw && typeof raw === 'string') {
      return raw
        .replace(/^@[^/]+\//, '') // strip npm scope (@org/name → name)
        .replace(/[^a-z0-9-]/gi, '_') // non-slug chars → underscore
        .replace(/_+/g, '_') // collapse consecutive underscores
        .replace(/^_|_$/g, '') // trim leading/trailing underscores
        .toLowerCase();
    }
  } catch {
    // no package.json or unreadable — fall through
  }

  return path
    .basename(cwd)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '_');
};

/**
 * @param {{ cwd?: string }} [opts]
 * @returns {Promise<string>}
 */
const getNewKeyPath = async (opts) => {
  const slug = await getProjectSlug(opts?.cwd);
  return path.join(os.homedir(), '.ssh', `pprr_${slug}_deploy_key`);
};

const NEW = Symbol();
const NONE = Symbol();

/**
 * @template Value
 * @typedef {Object} Choice
 * @property {Value} value
 * @property {string} [name]
 */

/**
 * @arg {Partial<{allowNone:boolean,default:string}>} [opts]
 * @returns {Promise<string>}
 */
const getKeyPathInteractively = async (opts) => {
  const newKeyPath = await getNewKeyPath();
  const existingKeys = await getSshKeys();

  /** @type {Choice<string | typeof NEW | typeof NONE>[]} */
  const choices = [
    ...existingKeys.map((keyPath) => ({
      value: keyPath,
      name: path.basename(keyPath),
    })),
    { value: NEW, name: `<Create new key ${newKeyPath}>` },
  ];
  if (opts?.allowNone) {
    choices.unshift({ value: NONE, name: '<Skip>' });
  }

  const selection = await select({
    message: `Which SSH key to try?`,
    choices,
    default: opts?.default,
  });
  if (typeof selection === 'string') return selection;
  if (selection === NONE) return '';

  await assertSshKeygenExists();

  await fs.mkdir(path.dirname(newKeyPath), { recursive: true });
  await execFileAsync('ssh-keygen', [
    '-t',
    'ed25519', // key type — ed25519 is modern, compact, and fast vs RSA
    '-f',
    newKeyPath, // output file path
    '-N',
    '', // empty passphrase — required for unattended use (no human to type it)
    '-C',
    'pprr-deploy-key', // comment embedded in the public key to identify its purpose
  ]);
  await fs.chmod(newKeyPath, 0o600);
  log.verbose(`Generated SSH key at ${newKeyPath}`);

  return newKeyPath;
};

export default getKeyPathInteractively;
