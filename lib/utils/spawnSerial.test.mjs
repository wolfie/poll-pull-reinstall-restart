import { test } from 'node:test';
import assert from 'node:assert/strict';
import spawnSerial from './spawnSerial.mjs';

// We borrow `node -e <script>` as the "package manager" so we can run inline
// JS without depending on a real pnpm/npm/yarn binary in the test env.
const nodePm =
  /** @type {import('../node/getPackageManagerInfo.mjs').PackageManagerInfo} */ (
    /** @type {unknown} */ ({
      manager: 'node',
      args: [],
      prodArg: '',
      runArg: '-e',
    })
  );

/** @param {import('node:test').TestContext} t */
const quiet = (t) => {
  t.mock.method(process.stderr, 'write', () => true);
  t.mock.method(console, 'log', () => {});
};

test('spawnSerial', async (t) => {
  await t.test('runs scripts in order and resolves when done', async (t) => {
    quiet(t);
    const result = spawnSerial(nodePm, [
      'process.exit(0)',
      'process.exit(0)',
      'process.exit(0)',
    ]);
    await result.promise;
  });

  await t.test(
    'rejects the outer promise when a script exits non-zero',
    async (t) => {
      quiet(t);
      const result = spawnSerial(nodePm, [
        'process.exit(1)',
        'process.exit(0)',
      ]);
      await assert.rejects(result.promise, /exited with code 1/);
    },
  );

  await t.test('killAll() resolves the outer promise cleanly', async (t) => {
    quiet(t);
    const result = spawnSerial(nodePm, [
      'setInterval(() => {}, 60000)',
      'process.exit(0)',
    ]);
    await new Promise((r) => setTimeout(r, 50));
    const child = result.getCurrentChild();
    assert.ok(child, 'expected a running child before killAll');
    await result.killAll(500);
    assert.ok(
      child.exitCode !== null || child.signalCode !== null,
      'expected the running child to have been terminated',
    );
    await result.promise;
    assert.equal(result.getCurrentChild(), undefined);
  });
});
