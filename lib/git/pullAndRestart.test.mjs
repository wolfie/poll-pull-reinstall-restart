import { test } from 'node:test';
import assert from 'node:assert/strict';
import createPullAndRestart from './pullAndRestart.mjs';

/** @type {import('../getEnv.mjs').Env} */
const fakeEnv = {
  restartScripts: ['start'],
  onceScripts: [],
  sshKeyPath: undefined,
  installDevPkgs: false,
  pollInterval: 60,
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
        spawnSerial: () => {
          calls.push('serial');
          return serialCallCount++ === 0 ? firstStub.serial : secondStub.serial;
        },
      });
      await fn(fakeEnv, fakePm); // first run
      calls.length = 0;
      await fn(fakeEnv, fakePm); // second run, changed=true
      assert.ok(firstStub.wasKilled(), 'first spawn should have been killed');
      assert.deepEqual(calls, ['install', 'serial']);
    },
  );

  await t.test('pull failure logs and returns without throwing', async (t) => {
    quiet(t);
    const errorSpy = t.mock.method(console, 'error', () => {});
    const fn = createPullAndRestart({
      execGitPull: async () => ({ success: false }),
      execProjectInstall: async () => {
        assert.fail('install should not run');
        return 0;
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
