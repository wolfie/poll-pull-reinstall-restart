import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import execNvm from './execNvm.mjs';

/** @param {import('node:test').TestContext} t */
const quiet = (t) => {
  t.mock.method(process.stderr, 'write', () => true);
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
};

const FAKE_NVM_SH_OK = `
nvm() {
  local cmd="$1"
  if [ "$cmd" = "install" ]; then
    echo "Fake nvm: $cmd" >&2
    export PATH="/fake/nvm/bin:$PATH"
    return 0
  fi
  return 1
}
`;

const FAKE_NVM_SH_FAIL = `
nvm() {
  echo "Fake nvm: install failed" >&2
  return 1
}
`;

test('execNvm', async (t) => {
  const originalCwd = process.cwd();
  const originalNvmDir = process.env['NVM_DIR'];
  const originalPath = process.env['PATH'];
  const workDir = mkdtempSync(join(tmpdir(), 'pprr-nvm-test-'));

  t.after(() => {
    process.chdir(originalCwd);
    if (originalNvmDir === undefined) delete process.env['NVM_DIR'];
    else process.env['NVM_DIR'] = originalNvmDir;
    process.env['PATH'] = originalPath;
    rmSync(workDir, { recursive: true, force: true });
  });

  await t.test('skips when no .nvmrc is present', async (t) => {
    quiet(t);
    const dir = mkdtempSync(join(workDir, 'no-nvmrc-'));
    process.chdir(dir);
    const result = await execNvm();
    assert.deepEqual(result, { skipped: true });
  });

  await t.test(
    'skips with warning when .nvmrc present but nvm not found',
    async (t) => {
      quiet(t);
      const dir = mkdtempSync(join(workDir, 'nvmrc-no-nvm-'));
      writeFileSync(join(dir, '.nvmrc'), '20\n');
      process.chdir(dir);
      process.env['NVM_DIR'] = join(workDir, 'nonexistent-nvm');
      const result = await execNvm();
      assert.deepEqual(result, { skipped: true });
    },
  );

  await t.test('runs nvm install and captures updated PATH', async (t) => {
    quiet(t);
    const fakeNvmDir = join(workDir, 'fake-nvm-ok');
    mkdirSync(fakeNvmDir);
    writeFileSync(join(fakeNvmDir, 'nvm.sh'), FAKE_NVM_SH_OK);

    const repoDir = mkdtempSync(join(workDir, 'repo-ok-'));
    writeFileSync(join(repoDir, '.nvmrc'), '20\n');
    process.chdir(repoDir);
    process.env['NVM_DIR'] = fakeNvmDir;

    const result = await execNvm();
    assert.deepEqual(result, { success: true });
    assert.ok(
      process.env['PATH']?.startsWith('/fake/nvm/bin:'),
      `Expected PATH to start with /fake/nvm/bin:, got: ${process.env['PATH']}`,
    );
    process.env['PATH'] = originalPath;
  });

  await t.test('returns {success:false} when nvm install fails', async (t) => {
    quiet(t);
    const fakeNvmDir = join(workDir, 'fake-nvm-fail');
    mkdirSync(fakeNvmDir);
    writeFileSync(join(fakeNvmDir, 'nvm.sh'), FAKE_NVM_SH_FAIL);

    const repoDir = mkdtempSync(join(workDir, 'repo-fail-'));
    writeFileSync(join(repoDir, '.nvmrc'), '20\n');
    process.chdir(repoDir);
    process.env['NVM_DIR'] = fakeNvmDir;

    const result = await execNvm();
    assert.deepEqual(result, { success: false });
  });
});
