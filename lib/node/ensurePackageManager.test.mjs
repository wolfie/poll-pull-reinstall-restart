import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  chmodSync,
  readFileSync,
  existsSync,
  copyFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ensurePackageManager from './ensurePackageManager.mjs';

/** @param {import('node:test').TestContext} t */
const quiet = (t) => {
  t.mock.method(process.stderr, 'write', () => true);
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
};

/** @type {(manager: 'pnpm'|'yarn'|'npm') => import('./getPackageManagerInfo.mjs').PackageManagerInfo} */
const pm = (manager) => ({ manager, args: [], prodArg: '', runArg: 'run' });

/**
 * Builds an isolated fake toolchain. PATH is set to `bin` only, so nothing
 * from the host (real npm/corepack/pnpm) can leak in.
 *
 * Fake behavior, mirroring the real tools:
 * - `npm install -g corepack` copies a fake `corepack` into bin
 * - `corepack enable` copies a fake `pnpm` into bin
 * Every invocation is appended to a log file.
 *
 * @param {string} workDir
 * @param {{ npmExitCode?: number }} [opts]
 */
const makeToolchain = (workDir, opts = {}) => {
  const root = mkdtempSync(join(workDir, 'toolchain-'));
  const bin = join(root, 'bin');
  const stage = join(root, 'stage');
  const logFile = join(root, 'calls.log');
  mkdirSync(bin);
  mkdirSync(stage);
  writeFileSync(logFile, '');

  /** @param {string} dir @param {string} name @param {string} body */
  const script = (dir, name, body) => {
    const file = join(dir, name);
    writeFileSync(
      file,
      `#!/bin/sh\necho "${name} $*" >> "${logFile}"\n${body}\n`,
    );
    chmodSync(file, 0o755);
  };

  script(stage, 'pnpm', 'exit 0');
  script(stage, 'corepack', `/bin/cp "${stage}/pnpm" "${bin}/pnpm"`);
  script(
    stage,
    'npm',
    opts.npmExitCode
      ? `exit ${opts.npmExitCode}`
      : `/bin/cp "${stage}/corepack" "${bin}/corepack"`,
  );

  /** @param {'npm'|'corepack'|'pnpm'} name */
  const add = (name) => {
    copyFileSync(join(stage, name), join(bin, name));
    chmodSync(join(bin, name), 0o755);
  };
  const calls = () =>
    readFileSync(logFile, 'utf-8').split('\n').filter(Boolean);

  process.env['PATH'] = bin;
  return { bin, add, calls };
};

test('ensurePackageManager', async (t) => {
  const originalPath = process.env['PATH'];
  const workDir = mkdtempSync(join(tmpdir(), 'pprr-ensurepm-test-'));

  t.after(() => {
    process.env['PATH'] = originalPath;
    rmSync(workDir, { recursive: true, force: true });
  });
  t.afterEach(() => {
    process.env['PATH'] = originalPath;
  });

  await t.test('runs corepack enable when corepack is present', async (t) => {
    quiet(t);
    const tc = makeToolchain(workDir);
    tc.add('npm');
    tc.add('corepack');
    const ok = await ensurePackageManager(pm('pnpm'), {
      corepackEnable: true,
      corepackAutoInstall: false,
    });
    assert.equal(ok, true);
    assert.deepEqual(tc.calls(), ['corepack enable']);
  });

  await t.test(
    'installs corepack via npm when corepack and pnpm are missing and auto-install is allowed',
    async (t) => {
      quiet(t);
      const tc = makeToolchain(workDir);
      tc.add('npm');
      const ok = await ensurePackageManager(pm('pnpm'), {
        corepackEnable: true,
        corepackAutoInstall: true,
      });
      assert.equal(ok, true);
      assert.deepEqual(tc.calls(), [
        'npm install -g corepack',
        'corepack enable',
      ]);
      assert.ok(existsSync(join(tc.bin, 'pnpm')));
    },
  );

  await t.test(
    'does not install corepack when auto-install is not allowed',
    async (t) => {
      quiet(t);
      const tc = makeToolchain(workDir);
      tc.add('npm');
      const ok = await ensurePackageManager(pm('pnpm'), {
        corepackEnable: true,
        corepackAutoInstall: false,
      });
      assert.equal(ok, false);
      assert.deepEqual(tc.calls(), []);
    },
  );

  await t.test(
    'does not install corepack when pnpm is already on PATH',
    async (t) => {
      quiet(t);
      const tc = makeToolchain(workDir);
      tc.add('npm');
      tc.add('pnpm');
      const ok = await ensurePackageManager(pm('pnpm'), {
        corepackEnable: true,
        corepackAutoInstall: true,
      });
      assert.equal(ok, true);
      assert.deepEqual(tc.calls(), []);
    },
  );

  await t.test('never installs corepack for npm projects', async (t) => {
    quiet(t);
    const tc = makeToolchain(workDir);
    tc.add('npm');
    const ok = await ensurePackageManager(pm('npm'), {
      corepackEnable: true,
      corepackAutoInstall: true,
    });
    assert.equal(ok, true);
    assert.deepEqual(tc.calls(), []);
  });

  await t.test(
    'skips corepack entirely when corepackEnable is false',
    async (t) => {
      quiet(t);
      const tc = makeToolchain(workDir);
      tc.add('npm');
      tc.add('corepack');
      const ok = await ensurePackageManager(pm('pnpm'), {
        corepackEnable: false,
        corepackAutoInstall: true,
      });
      assert.equal(ok, false);
      assert.deepEqual(tc.calls(), []);
    },
  );

  await t.test(
    'returns false without throwing when npm install fails',
    async (t) => {
      quiet(t);
      const tc = makeToolchain(workDir, { npmExitCode: 1 });
      tc.add('npm');
      const ok = await ensurePackageManager(pm('pnpm'), {
        corepackEnable: true,
        corepackAutoInstall: true,
      });
      assert.equal(ok, false);
      assert.deepEqual(tc.calls(), ['npm install -g corepack']);
    },
  );
});
