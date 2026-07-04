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
        execCorepackEnable: async () => {
          calls.push('corepack');
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
      execCorepackEnable: async () => {},
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
        execCorepackEnable: async () => {
          calls.push('corepack');
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
      assert.deepEqual(calls, ['install', 'serial']);
    },
  );

  await t.test(
    'subsequent run with changes runs corepack when corepackEnable is true',
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
          return { skipped: true };
        },
        execCorepackEnable: async () => {
          calls.push('corepack');
        },
        spawnSerial: () => {
          calls.push('serial');
          return makeStubSerialResult().serial;
        },
      });
      const envWithCorepack = { ...fakeEnv, corepackEnable: true };
      await fn(envWithCorepack, fakePm); // first run
      calls.length = 0;
      await fn(envWithCorepack, fakePm); // second run, changed=true
      // nvmAutoInstall=false, so only corepack + install + serial
      assert.deepEqual(calls, ['corepack', 'install', 'serial']);
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
        execCorepackEnable: async () => {},
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
        execCorepackEnable: async () => {},
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
      execCorepackEnable: async () => {},
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
      execCorepackEnable: async () => {},
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

  await t.test('notifies when git pull fails', async (t) => {
    quiet(t);
    /** @type {{title:string,body?:string}[]} */
    const notifications = [];
    const fn = createPullAndRestart({
      execGitPull: async () => ({ success: false }),
      execProjectInstall: async () => 0,
      execNvm: async () => ({ skipped: true }),
      execCorepackEnable: async () => {},
      spawnSerial: () => makeStubSerialResult().serial,
      notify: async (_env, notification) => {
        notifications.push(notification);
      },
    });
    await fn(fakeEnv, fakePm);
    assert.deepEqual(notifications, [{ title: 'Git pull failed' }]);
  });

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
      execCorepackEnable: async () => {},
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
      execCorepackEnable: async () => {
        assert.fail('corepack should not run');
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
        execCorepackEnable: async () => {},
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
