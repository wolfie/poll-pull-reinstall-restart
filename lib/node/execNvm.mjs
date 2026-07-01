import { spawn as nodeSpawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import log from '../utils/log.mjs';
import kleur from 'kleur';

/**
 * @returns {Promise<string|null>} absolute path to nvm.sh, or null if not installed
 */
const findNvmScript = async () => {
  const nvmDir = process.env['NVM_DIR'] ?? path.join(os.homedir(), '.nvm');
  const nvmScript = path.join(nvmDir, 'nvm.sh');
  return fs
    .access(nvmScript)
    .then(() => nvmScript)
    .catch(() => null);
};

/**
 * Runs `nvm install` if .nvmrc is present in cwd.
 * On success, updates process.env.PATH to the PATH reported by the nvm subshell
 * so that subsequent spawns use the switched Node/npm/pnpm binaries.
 *
 * Call this only when NVM_AUTO_INSTALL is enabled; the caller is responsible
 * for gating on that env var.
 *
 * @returns {Promise<{skipped:true}|{success:true}|{success:false}>}
 */
const execNvm = async () => {
  const nvmrcPath = path.join(process.cwd(), '.nvmrc');
  const hasNvmrc = await fs
    .access(nvmrcPath)
    .then(() => true)
    .catch(() => false);
  if (!hasNvmrc) return { skipped: true };

  const nvmScript = await findNvmScript();
  if (!nvmScript) {
    log.error(
      '.nvmrc found but nvm is not installed — skipping Node version switch',
    );
    return { skipped: true };
  }

  log.info(`Running ${kleur.yellow('nvm install')}`);

  // nvm output goes to stderr so user sees it; stdout carries only the PATH
  // string we print after a successful switch, which we capture and apply.
  const bashCmd = `. "${nvmScript}" && nvm install >&2 && printf "%s" "$PATH"`;

  return new Promise((resolve) => {
    const child = nodeSpawn('bash', ['-c', bashCmd]);
    /** @type {Buffer[]} */
    const stdoutChunks = [];

    child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));

    child.on('close', (code) => {
      if (code !== 0) {
        log.error(`nvm install failed with exit code ${code}`);
        resolve({ success: false });
        return;
      }
      const newPath = Buffer.concat(stdoutChunks).toString().trim();
      if (newPath) process.env['PATH'] = newPath;
      resolve({ success: true });
    });

    child.on('error', (error) => {
      log.error('Failed to run nvm:', error);
      resolve({ success: false });
    });
  });
};

export default execNvm;
