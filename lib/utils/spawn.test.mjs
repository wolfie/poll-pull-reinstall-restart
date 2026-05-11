import { test } from 'node:test';
import assert from 'node:assert/strict';
import spawn from './spawn.mjs';

/**
 * Silence the prefixed live output spawn writes to process.stderr. We avoid
 * mocking process.stdout because the test runner uses it for its own report.
 *
 * @param {import('node:test').TestContext} t
 */
const quiet = (t) => {
  t.mock.method(process.stderr, 'write', () => true);
};

test('spawn', async (t) => {
  await t.test('resolves with exit code 0 on clean exit', async (t) => {
    quiet(t);
    const exitCode = await spawn('node', ['-e', 'process.exit(0)']).promise;
    assert.equal(exitCode, 0);
  });

  await t.test('resolves with non-zero exit code', async (t) => {
    quiet(t);
    const exitCode = await spawn('node', ['-e', 'process.exit(3)']).promise;
    assert.equal(exitCode, 3);
  });

  await t.test('captures stderr when captureStdErr is set', async (t) => {
    quiet(t);
    const result = spawn(
      'node',
      [
        '-e',
        'process.stderr.write("err1"); process.stderr.write("err2"); process.exit(0)',
      ],
      { captureStdErr: true },
    );
    await result.promise;
    assert.equal(result.getStdErr(), 'err1err2');
  });

  await t.test('does not capture stderr by default', async (t) => {
    quiet(t);
    const result = spawn('node', [
      '-e',
      'process.stderr.write("oops"); process.exit(0)',
    ]);
    await result.promise;
    assert.equal(result.getStdErr(), '');
  });

  await t.test('merges opts.env onto process.env in the child', async (t) => {
    quiet(t);
    const result = spawn(
      'node',
      ['-e', 'process.stderr.write(process.env.PPRR_TEST_VAR ?? "")'],
      { env: { PPRR_TEST_VAR: 'hello' }, captureStdErr: true },
    );
    await result.promise;
    assert.equal(result.getStdErr(), 'hello');
  });

  await t.test('rejects when the binary does not exist', async (t) => {
    quiet(t);
    // spawn's 'error' handler also calls console.error
    t.mock.method(console, 'error', () => {});
    await assert.rejects(
      spawn('pprr-nonexistent-binary-zzz', []).promise,
      (err) => /** @type {any} */ (err).code === 'ENOENT',
    );
  });

  await t.test('kill() terminates a running child', async (t) => {
    quiet(t);
    const result = spawn('node', ['-e', 'setInterval(() => {}, 60000)']);
    // Give the child a moment to start.
    await new Promise((r) => setTimeout(r, 50));
    await result.kill(500);
    await result.promise;
    assert.ok(
      result.child.exitCode !== null || result.child.signalCode !== null,
      'expected child to have terminated',
    );
  });
});
