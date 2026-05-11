import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import execGitClone from './execGitClone.mjs';

/**
 * @param {string[]} args
 * @param {string} cwd
 */
const git = (args, cwd) =>
  execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: 'pipe' });

/** @param {import('node:test').TestContext} t */
const quiet = (t) => {
  t.mock.method(process.stderr, 'write', () => true);
};

test('execGitClone', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'pprr-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  // Seed a bare remote with one commit so it can be cloned.
  const bare = join(dir, 'remote.git');
  const seed = join(dir, 'seed');
  git(['init', '--bare', bare], dir);
  git(['clone', bare, seed], dir);
  git(['config', 'user.email', 'test@test.com'], seed);
  git(['config', 'user.name', 'Test'], seed);
  git(['commit', '--allow-empty', '-m', 'init'], seed);
  git(['push', 'origin', 'HEAD'], seed);

  await t.test('returns success on a successful clone', async (t) => {
    quiet(t);
    const result = await execGitClone(bare, join(dir, 'cloned-ok'), undefined);
    assert.deepEqual(result, { success: true });
  });

  await t.test(
    'returns success=false with authError=false for a missing remote',
    async (t) => {
      quiet(t);
      const result = await execGitClone(
        join(dir, 'does-not-exist'),
        join(dir, 'attempted'),
        undefined,
      );
      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.authError, false);
        assert.ok(
          result.stdErr.length > 0,
          'stderr should be captured on failure',
        );
      }
    },
  );
});
