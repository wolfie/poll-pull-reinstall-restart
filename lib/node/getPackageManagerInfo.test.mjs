import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import getPackageManagerInfo from './getPackageManagerInfo.mjs';

class ExitError extends Error {
  /** @param {number} code */
  constructor(code) {
    super(`process.exit(${code})`);
    this.exitCode = code;
  }
}

test('getPackageManagerInfo', async (t) => {
  const originalCwd = process.cwd();
  const dir = mkdtempSync(join(tmpdir(), 'pprr-test-'));

  t.after(() => {
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true, force: true });
  });

  /**
   * @param {string} name
   * @param {string[]} lockFiles
   * @returns {string}
   */
  const subdirWith = (name, lockFiles) => {
    const sub = join(dir, name);
    mkdirSync(sub);
    for (const f of lockFiles) writeFileSync(join(sub, f), '');
    return sub;
  };

  await t.test('detects pnpm via pnpm-lock.yaml', async () => {
    process.chdir(subdirWith('pnpm', ['pnpm-lock.yaml']));
    const info = await getPackageManagerInfo();
    assert.equal(info.manager, 'pnpm');
  });

  await t.test('detects npm via package-lock.json', async () => {
    process.chdir(subdirWith('npm', ['package-lock.json']));
    const info = await getPackageManagerInfo();
    assert.equal(info.manager, 'npm');
  });

  await t.test('detects yarn via yarn.lock', async () => {
    process.chdir(subdirWith('yarn', ['yarn.lock']));
    const info = await getPackageManagerInfo();
    assert.equal(info.manager, 'yarn');
  });

  await t.test('exits when no lock file is found', async (t) => {
    process.chdir(subdirWith('none', []));
    t.mock.method(process, 'exit', (/** @type {number} */ code) => {
      throw new ExitError(code);
    });
    t.mock.method(console, 'error', () => {});
    await assert.rejects(getPackageManagerInfo(), ExitError);
  });

  await t.test('exits when multiple lock files are found', async (t) => {
    process.chdir(subdirWith('multi', ['pnpm-lock.yaml', 'package-lock.json']));
    t.mock.method(process, 'exit', (/** @type {number} */ code) => {
      throw new ExitError(code);
    });
    t.mock.method(console, 'error', () => {});
    await assert.rejects(getPackageManagerInfo(), ExitError);
  });
});
