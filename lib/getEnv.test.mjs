import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import getEnv from './getEnv.mjs';

class ExitError extends Error {
  /** @param {number} code */
  constructor(code) {
    super(`process.exit(${code})`);
    this.exitCode = code;
  }
}

const ENV_KEYS = /** @type {const} */ ([
  'RESTART_SCRIPTS',
  'ONCE_SCRIPTS',
  'SSH_KEY_PATH',
  'INSTALL_DEV_PKGS',
  'POLL_INTERVAL',
  'NVM_AUTO_INSTALL',
  'COREPACK_ENABLE',
]);

const snapshotEnv = () => {
  /** @type {Record<string, string | undefined>} */
  const snap = {};
  for (const k of ENV_KEYS) snap[k] = process.env[k];
  return snap;
};

/** @param {Record<string, string | undefined>} snap */
const restoreEnv = (snap) => {
  for (const k of ENV_KEYS) {
    if (snap[k] === undefined) delete process.env[k];
    else process.env[k] = snap[k];
  }
};

test('getEnv', async (t) => {
  const originalCwd = process.cwd();
  const dir = mkdtempSync(join(tmpdir(), 'pprr-test-'));
  const initialEnv = snapshotEnv();

  t.beforeEach(() => restoreEnv(initialEnv));
  t.after(() => {
    process.chdir(originalCwd);
    restoreEnv(initialEnv);
    rmSync(dir, { recursive: true, force: true });
  });

  /**
   * @param {string} name
   * @param {string|null} pprrcContent  null = no .pprrc at all
   */
  const subdir = (name, pprrcContent) => {
    const sub = join(dir, name);
    mkdirSync(sub);
    if (pprrcContent !== null) writeFileSync(join(sub, '.pprrc'), pprrcContent);
    return sub;
  };

  await t.test('reads .pprrc and returns parsed values', async (t) => {
    t.mock.method(console, 'log', () => {});
    process.chdir(
      subdir(
        'full',
        [
          'RESTART_SCRIPTS=start,build',
          'ONCE_SCRIPTS=migrate',
          'INSTALL_DEV_PKGS=true',
          'POLL_INTERVAL=30',
        ].join('\n'),
      ),
    );
    const env = await getEnv();
    assert.deepEqual(env.restartScripts, ['start', 'build']);
    assert.deepEqual(env.onceScripts, ['migrate']);
    assert.equal(env.installDevPkgs, true);
    assert.equal(env.pollInterval, 30);
  });

  await t.test(
    'defaults pollInterval to 60 and installDevPkgs to false',
    async (t) => {
      t.mock.method(console, 'log', () => {});
      process.chdir(subdir('minimal', 'RESTART_SCRIPTS=start'));
      const env = await getEnv();
      assert.equal(env.pollInterval, 60);
      assert.equal(env.installDevPkgs, false);
      assert.deepEqual(env.onceScripts, []);
      assert.equal(env.sshKeyPath, undefined);
    },
  );

  await t.test(
    'nvmAutoInstall and corepackEnable default to true when unset',
    async (t) => {
      t.mock.method(console, 'log', () => {});
      delete process.env['NVM_AUTO_INSTALL'];
      delete process.env['COREPACK_ENABLE'];
      process.chdir(subdir('nvm-defaults', 'RESTART_SCRIPTS=start'));
      const env = await getEnv();
      assert.equal(env.nvmAutoInstall, true);
      assert.equal(env.corepackEnable, true);
    },
  );

  await t.test(
    'NVM_AUTO_INSTALL and COREPACK_ENABLE can be disabled explicitly',
    async (t) => {
      t.mock.method(console, 'log', () => {});
      process.chdir(
        subdir(
          'nvm-disabled',
          'RESTART_SCRIPTS=start\nNVM_AUTO_INSTALL=false\nCOREPACK_ENABLE=false',
        ),
      );
      const env = await getEnv();
      assert.equal(env.nvmAutoInstall, false);
      assert.equal(env.corepackEnable, false);
    },
  );

  await t.test('clamps non-numeric POLL_INTERVAL to 60', async (t) => {
    t.mock.method(console, 'log', () => {});
    process.chdir(
      subdir('bad-poll', 'RESTART_SCRIPTS=start\nPOLL_INTERVAL=banana'),
    );
    const env = await getEnv();
    assert.equal(env.pollInterval, 60);
  });

  await t.test('reads env vars when .pprrc is absent', async (t) => {
    t.mock.method(console, 'log', () => {});
    process.chdir(subdir('no-pprrc', null));
    process.env.RESTART_SCRIPTS = 'start,build';
    const env = await getEnv();
    assert.deepEqual(env.restartScripts, ['start', 'build']);
  });

  await t.test('exits if RESTART_SCRIPTS is missing', async (t) => {
    t.mock.method(console, 'log', () => {});
    t.mock.method(console, 'error', () => {});
    t.mock.method(process, 'exit', (/** @type {number} */ code) => {
      throw new ExitError(code);
    });
    process.chdir(subdir('no-restart', '# nothing'));
    await assert.rejects(getEnv(), ExitError);
  });
});
