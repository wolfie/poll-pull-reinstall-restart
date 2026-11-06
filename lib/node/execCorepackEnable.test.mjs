import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import execCorepackEnable from './execCorepackEnable.mjs';

/** @param {import('node:test').TestContext} t */
const quiet = (t) => {
  t.mock.method(process.stderr, 'write', () => true);
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
};

/**
 * Creates a fake `corepack` script in a temp bin dir and prepends it to PATH.
 * Returns the bin dir path; caller must clean it up and restore PATH.
 *
 * @param {string} workDir
 * @param {number} exitCode
 */
const makeFakeCorepack = (workDir, exitCode) => {
  const binDir = mkdtempSync(join(workDir, 'bin-'));
  const script = join(binDir, 'corepack');
  writeFileSync(script, `#!/bin/sh\nexit ${exitCode}\n`);
  chmodSync(script, 0o755);
  return binDir;
};

test('execCorepackEnable', async (t) => {
  const originalPath = process.env['PATH'];
  const workDir = mkdtempSync(join(tmpdir(), 'pprr-corepack-test-'));

  t.after(() => {
    process.env['PATH'] = originalPath;
    rmSync(workDir, { recursive: true, force: true });
  });

  await t.test(
    "returns 'missing' without throwing when corepack is not found",
    async (t) => {
      quiet(t);
      const emptyBin = mkdtempSync(join(workDir, 'empty-'));
      process.env['PATH'] = emptyBin;
      assert.equal(await execCorepackEnable(), 'missing');
      process.env['PATH'] = originalPath;
    },
  );

  await t.test(
    "returns 'failed' without throwing when corepack exits non-zero",
    async (t) => {
      quiet(t);
      const binDir = makeFakeCorepack(workDir, 1);
      process.env['PATH'] = `${binDir}:${originalPath}`;
      assert.equal(await execCorepackEnable(), 'failed');
      process.env['PATH'] = originalPath;
    },
  );

  await t.test("returns 'ok' on success", async (t) => {
    quiet(t);
    const binDir = makeFakeCorepack(workDir, 0);
    process.env['PATH'] = `${binDir}:${originalPath}`;
    assert.equal(await execCorepackEnable(), 'ok');
    process.env['PATH'] = originalPath;
  });
});
