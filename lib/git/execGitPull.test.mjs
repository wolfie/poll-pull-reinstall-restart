import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import execGitPull from './execGitPull.mjs';

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

test('execGitPull', async (t) => {
  const originalCwd = process.cwd();
  const dir = mkdtempSync(join(tmpdir(), 'pprr-test-'));
  t.after(() => {
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true, force: true });
  });

  const bare = join(dir, 'remote.git');
  const clone = join(dir, 'clone');
  const pusher = join(dir, 'pusher');

  git(['init', '--bare', bare], dir);
  git(['clone', bare, clone], dir);
  git(['config', 'user.email', 'test@test.com'], clone);
  git(['config', 'user.name', 'Test'], clone);
  git(['commit', '--allow-empty', '-m', 'init'], clone);
  const branch = git(['branch', '--show-current'], clone).trim();
  git(['push', '-u', 'origin', branch], clone);

  git(['clone', bare, pusher], dir);
  git(['config', 'user.email', 'test@test.com'], pusher);
  git(['config', 'user.name', 'Test'], pusher);

  await t.test('returns changed=false when already up to date', async (t) => {
    quiet(t);
    process.chdir(clone);
    const result = await execGitPull(undefined);
    assert.deepEqual(result, { success: true, changed: false });
  });

  await t.test('returns changed=true after upstream pushes', async (t) => {
    quiet(t);
    git(['commit', '--allow-empty', '-m', 'new'], pusher);
    git(['push', 'origin', branch], pusher);
    process.chdir(clone);
    const result = await execGitPull(undefined);
    assert.deepEqual(result, { success: true, changed: true });
  });
});
