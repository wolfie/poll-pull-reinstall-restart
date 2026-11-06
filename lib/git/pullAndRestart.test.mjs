import { test } from 'node:test';
import assert from 'node:assert/strict';
import createPullAndRestart from './pullAndRestart.mjs';

/** @type {import('../getEnv.mjs').Env} */
const fakeEnv = {
  restartScripts: ['start'],
  onceScripts: [],
  sshKeyPath: undefined,
  installDevPkgs: false,
  nvmAutoInstall: false,
  corepackEnable: false,
  corepackAutoInstall: false,
  pollInterval: 60,
  serviceName: undefined,
  ntfyTopic: undefined,
  ntfyServer: undefined,
};

/** @type {import('../node/getPackageManagerInfo.mjs').PackageManagerInfo} */
const fakePm = {
  manager: 'pnpm',
  args: ['i', '--frozen-lockfile'],
  prodArg: '--prod',
  runArg: 'run',
};

const makeStubSerialResult = () => {
  let killed = false;
  return {
    /** @type {import('../utils/spawnSerial.mjs').SpawnSerialResult} */
    serial: {
      promise: Promise.resolve(),
      killAll: async () => {
        killed = true;
      },
      getCurrentChild: () => undefined,
    },
    wasKilled: () => killed,
  };
};

/** @param {import('node:test').TestContext} t */
const quiet = (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
};

test('createPullAndRestart', async (t) => {
  await t.test(
    'first run pulls and starts restart scripts, skipping install',
    async (t) => {
      quiet(t);
      /** @type {string[]} */
      const calls = [];
      const fn = createPullAndRestart({
        execGitPull: async () => {
          calls.push('pull');
          return { success: true, changed: false };
        },
        execProjectInstall: async () => {
          calls.push('install');
          return 0;
        },
        execNvm: async () => {
          calls.push('nvm');
          return { skipped: true };
        },
        ensurePackageManager: async () => {
          calls.push('ensure');
          return true;
        },
        spawnSerial: () => {
          calls.push('serial');
          return makeStubSerialResult().serial;
        },
      });
      await fn(fakeEnv, fakePm);
      assert.deepEqual(calls, ['pull', 'serial']);
    },
  );

  await t.test('subsequent run with no changes does nothing', async (t) => {
    quiet(t);
    /** @type {string[]} */
    const calls = [];
    const fn = createPullAndRestart({
      execGitPull: async () => {
        calls.push('pull');
        return { success: true, changed: false };
      },
      execProjectInstall: async () => {
        calls.push('install');
        return 0;
      },
      execNvm: async () => ({ skipped: true }),
      ensurePackageManager: async () => true,
      spawnSerial: () => {
        calls.push('serial');
        return makeStubSerialResult().serial;
      },
    });
    await fn(fakeEnv, fakePm); // first run sets up state
    calls.length = 0;
    await fn(fakeEnv, fakePm); // second run with changed=false
    assert.deepEqual(calls, ['pull']);
  });

  await t.test(
    'subsequent run with changes kills, installs, and restarts',
    async (t) => {
      quiet(t);
      let pullCount = 0;
      /** @type {string[]} */
      const calls = [];
      const firstStub = makeStubSerialResult();
      const secondStub = makeStubSerialResult();
      let serialCallCount = 0;
      const fn = createPullAndRestart({
        execGitPull: async () => {
          pullCount++;
          return { success: true, changed: pullCount > 1 };
        },
        execProjectInstall: async () => {
          calls.push('install');
          return 0;
        },
        execNvm: async () => {
          calls.push('nvm');
          return { skipped: true };
        },
        ensurePackageManager: async () => {
          calls.push('ensure');
          return true;
        },
        spawnSerial: () => {
          calls.push('serial');
          return serialCallCount++ === 0 ? firstStub.serial : secondStub.serial;
        },
      });
      await fn(fakeEnv, fakePm); // first run
      calls.length = 0;
      await fn(fakeEnv, fakePm); // second run, changed=true
      assert.ok(firstStub.wasKilled(), 'first spawn should have been killed');
      // nvmAutoInstall=false in fakeEnv, so nvm is not called
      assert.deepEqual(calls, ['ensure', 'install', 'serial']);
    },
  );

  await t.test(
    'subsequent run with changes passes packageManager and env to ensurePackageManager',
    async (t) => {
      quiet(t);
      let pullCount = 0;
      /** @type {unknown[][]} */
      const ensureArgs = [];
      const fn = createPullAndRestart({
        execGitPull: async () => ({ success: true, changed: ++pullCount > 1 }),
        execProjectInstall: async () => 0,
        execNvm: async () => ({ skipped: true }),
        ensurePackageManager: async (...args) => {
          ensureArgs.push(args);
          return true;
        },
        spawnSerial: () => makeStubSerialResult().serial,
      });
      const env = {
        ...fakeEnv,
        corepackEnable: true,
        corepackAutoInstall: true,
      };
      await fn(env, fakePm); // first run: no ensure
      assert.equal(ensureArgs.length, 0);
      await fn(env, fakePm); // second run, changed=true
      assert.deepEqual(ensureArgs, [[fakePm, env]]);
    },
  );

  await t.test(
    'missing package manager skips install and restart, notifies, and does not throw',
    async (t) => {
      quiet(t);
      let pullCount = 0;
      /** @type {string[]} */
      const calls = [];
      /** @type {{title:string,body?:string}[]} */
      const notifications = [];
      const fn = createPullAndRestart({
        execGitPull: async () => ({ success: true, changed: ++pullCount > 1 }),
        execProjectInstall: async () => {
          calls.push('install');
          return 0;
        },
        execNvm: async () => ({ skipped: true }),
        ensurePackageManager: async () => pullCount === 1,
        spawnSerial: () => {
          calls.push('serial');
          return makeStubSerialResult().serial;
        },
        notify: async (_env, notification) => {
          notifications.push(notification);
        },
      });
      await fn(fakeEnv, fakePm); // first run
      calls.length = 0;
      notifications.length = 0;
      await fn(fakeEnv, fakePm); // second run, changed=true, pnpm missing
      assert.deepEqual(calls, []);
      assert.deepEqual(notifications, [
        { title: 'Update detected, restarting' },
        { title: 'Install failed', body: 'pnpm not found' },
      ]);
    },
  );

  await t.test(
    'failed install is retried on the next tick without upstream changes, notifying once',
    async (t) => {
      quiet(t);
      let pullCount = 0;
      const installExitCodes = [1, 1, 0];
      /** @type {string[]} */
      const calls = [];
      /** @type {{title:string,body?:string}[]} */
      const notifications = [];
      const fn = createPullAndRestart({
        // only the second pull brings changes
        execGitPull: async () => ({
          success: true,
          changed: ++pullCount === 2,
        }),
        execProjectInstall: async () => {
          calls.push('install');
          return installExitCodes.shift() ?? 0;
        },
        execNvm: async () => ({ skipped: true }),
        ensurePackageManager: async () => true,
        spawnSerial: () => {
          calls.push('serial');
          return makeStubSerialResult().serial;
        },
        notify: async (_env, notification) => {
          notifications.push(notification);
        },
      });
      await fn(fakeEnv, fakePm); // first run
      calls.length = 0;
      notifications.length = 0;

      await fn(fakeEnv, fakePm); // changed, install fails
      assert.deepEqual(calls, ['install']);
      await fn(fakeEnv, fakePm); // no changes, retry fails again
      assert.deepEqual(calls, ['install', 'install']);
      await fn(fakeEnv, fakePm); // no changes, retry succeeds
      assert.deepEqual(calls, ['install', 'install', 'install', 'serial']);
      await fn(fakeEnv, fakePm); // no changes, nothing pending
      assert.deepEqual(calls, ['install', 'install', 'install', 'serial']);

      assert.deepEqual(notifications, [
        { title: 'Update detected, restarting' },
        { title: 'Install failed', body: 'pnpm install exited with code 1' },
      ]);
    },
  );

  await t.test(
    'nvm runs on changed run when nvmAutoInstall is true',
    async (t) => {
      quiet(t);
      let pullCount = 0;
      /** @type {string[]} */
      const calls = [];
      const fn = createPullAndRestart({
        execGitPull: async () => {
          pullCount++;
          return { success: true, changed: pullCount > 1 };
        },
        execProjectInstall: async () => {
          calls.push('install');
          return 0;
        },
        execNvm: async () => {
          calls.push('nvm');
          return { success: true };
        },
        ensurePackageManager: async () => true,
        spawnSerial: () => {
          calls.push('serial');
          return makeStubSerialResult().serial;
        },
      });
      const envWithNvm = { ...fakeEnv, nvmAutoInstall: true };
      await fn(envWithNvm, fakePm); // first run
      calls.length = 0;
      await fn(envWithNvm, fakePm); // second run, changed=true
      assert.deepEqual(calls, ['nvm', 'install', 'serial']);
    },
  );

  await t.test(
    'nvm failure on changed run still installs and restarts',
    async (t) => {
      quiet(t);
      let pullCount = 0;
      /** @type {string[]} */
      const calls = [];
      const fn = createPullAndRestart({
        execGitPull: async () => {
          pullCount++;
          return { success: true, changed: pullCount > 1 };
        },
        execProjectInstall: async () => {
          calls.push('install');
          return 0;
        },
        execNvm: async () => {
          calls.push('nvm');
          return { success: false };
        },
        ensurePackageManager: async () => true,
        spawnSerial: () => {
          calls.push('serial');
          return makeStubSerialResult().serial;
        },
      });
      const envWithNvm = { ...fakeEnv, nvmAutoInstall: true };
      await fn(envWithNvm, fakePm); // first run
      calls.length = 0;
      await fn(envWithNvm, fakePm); // second run, changed=true, nvm fails
      assert.deepEqual(calls, ['nvm', 'install', 'serial']);
    },
  );

  await t.test('notifies on first run with restart script names', async (t) => {
    quiet(t);
    /** @type {{title:string,body?:string}[]} */
    const notifications = [];
    const fn = createPullAndRestart({
      execGitPull: async () => ({ success: true, changed: false }),
      execProjectInstall: async () => 0,
      execNvm: async () => ({ skipped: true }),
      ensurePackageManager: async () => true,
      spawnSerial: () => makeStubSerialResult().serial,
      notify: async (_env, notification) => {
        notifications.push(notification);
      },
    });
    await fn(fakeEnv, fakePm);
    assert.deepEqual(notifications, [
      { title: 'Service started', body: 'Script ran: start' },
    ]);
  });

  await t.test('notifies when update is detected', async (t) => {
    quiet(t);
    let pullCount = 0;
    /** @type {{title:string,body?:string}[]} */
    const notifications = [];
    const fn = createPullAndRestart({
      execGitPull: async () => ({ success: true, changed: ++pullCount > 1 }),
      execProjectInstall: async () => 0,
      execNvm: async () => ({ skipped: true }),
      ensurePackageManager: async () => true,
      spawnSerial: () => makeStubSerialResult().serial,
      notify: async (_env, notification) => {
        notifications.push(notification);
      },
    });
    await fn(fakeEnv, fakePm); // first run
    notifications.length = 0;
    await fn(fakeEnv, fakePm); // second run, changed=true
    assert.deepEqual(notifications, [{ title: 'Update detected, restarting' }]);
  });

  await t.test('does not notify on a single pull failure', async (t) => {
    quiet(t);
    /** @type {{title:string,body?:string}[]} */
    const notifications = [];
    const fn = createPullAndRestart({
      execGitPull: async () => ({ success: false }),
      execProjectInstall: async () => 0,
      execNvm: async () => ({ skipped: true }),
      ensurePackageManager: async () => true,
      spawnSerial: () => makeStubSerialResult().serial,
      notify: async (_env, notification) => {
        notifications.push(notification);
      },
    });
    await fn(fakeEnv, fakePm);
    assert.deepEqual(notifications, []);
  });

  await t.test(
    'notifies when git pull fails on two consecutive polls',
    async (t) => {
      quiet(t);
      /** @type {{title:string,body?:string}[]} */
      const notifications = [];
      const fn = createPullAndRestart({
        execGitPull: async () => ({ success: false }),
        execProjectInstall: async () => 0,
        execNvm: async () => ({ skipped: true }),
        ensurePackageManager: async () => true,
        spawnSerial: () => makeStubSerialResult().serial,
        notify: async (_env, notification) => {
          notifications.push(notification);
        },
      });
      await fn(fakeEnv, fakePm); // first failure, no notify
      await fn(fakeEnv, fakePm); // second consecutive failure, notifies
      assert.deepEqual(notifications, [{ title: 'Git pull failed' }]);
    },
  );

  await t.test(
    'a successful pull resets the consecutive failure count',
    async (t) => {
      quiet(t);
      let pullCount = 0;
      /** @type {{title:string,body?:string}[]} */
      const notifications = [];
      const fn = createPullAndRestart({
        execGitPull: async () => {
          pullCount++;
          // fail, succeed, fail: the trailing failure should not notify
          // since the intervening success reset the streak.
          return { success: pullCount === 2, changed: false };
        },
        execProjectInstall: async () => 0,
        execNvm: async () => ({ skipped: true }),
        ensurePackageManager: async () => true,
        spawnSerial: () => makeStubSerialResult().serial,
        notify: async (_env, notification) => {
          notifications.push(notification);
        },
      });
      await fn(fakeEnv, fakePm); // fail (1st)
      await fn(fakeEnv, fakePm); // succeed, resets streak
      notifications.length = 0;
      await fn(fakeEnv, fakePm); // fail (1st again)
      assert.deepEqual(notifications, []);
    },
  );

  await t.test('notifies when a restart script fails', async (t) => {
    quiet(t);
    /** @type {{title:string,body?:string}[]} */
    const notifications = [];
    /** @type {PromiseWithResolvers<void>} */
    const { promise, reject } = Promise.withResolvers();
    const fn = createPullAndRestart({
      execGitPull: async () => ({ success: true, changed: false }),
      execProjectInstall: async () => 0,
      execNvm: async () => ({ skipped: true }),
      ensurePackageManager: async () => true,
      spawnSerial: () => ({
        promise,
        killAll: async () => {},
        getCurrentChild: () => undefined,
      }),
      notify: async (_env, notification) => {
        notifications.push(notification);
      },
    });
    await fn(fakeEnv, fakePm);
    reject(new Error('Script "start" exited with code 1'));
    await Promise.resolve();
    assert.deepEqual(notifications, [
      { title: 'Service started', body: 'Script ran: start' },
      {
        title: 'Restart scripts failed',
        body: 'Script "start" exited with code 1',
      },
    ]);
  });

  await t.test('pull failure logs and returns without throwing', async (t) => {
    quiet(t);
    const errorSpy = t.mock.method(console, 'error', () => {});
    const fn = createPullAndRestart({
      execGitPull: async () => ({ success: false }),
      execProjectInstall: async () => {
        assert.fail('install should not run');
        return 0;
      },
      execNvm: async () => {
        assert.fail('nvm should not run');
        return { skipped: true };
      },
      ensurePackageManager: async () => {
        assert.fail('ensurePackageManager should not run');
      },
      spawnSerial: () => {
        assert.fail('serial should not run');
        return makeStubSerialResult().serial;
      },
    });
    await fn(fakeEnv, fakePm);
    assert.ok(errorSpy.mock.callCount() >= 1, 'expected an error to be logged');
  });

  await t.test(
    'concurrent invocation short-circuits while locked',
    async (t) => {
      quiet(t);
      /** @type {PromiseWithResolvers<void>} */
      const firstPullGate = Promise.withResolvers();
      let pullCount = 0;
      const fn = createPullAndRestart({
        execGitPull: async () => {
          pullCount++;
          if (pullCount === 1) await firstPullGate.promise;
          return { success: true, changed: false };
        },
        execProjectInstall: async () => 0,
        execNvm: async () => ({ skipped: true }),
        ensurePackageManager: async () => true,
        spawnSerial: () => makeStubSerialResult().serial,
      });
      const first = fn(fakeEnv, fakePm);
      const second = fn(fakeEnv, fakePm);
      await second; // returns immediately due to lock
      assert.equal(pullCount, 1);
      firstPullGate.resolve();
      await first;
      assert.equal(pullCount, 1);
    },
  );
});
