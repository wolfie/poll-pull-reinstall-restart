import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import getGitRepoRoot from './getGitRepoRoot.mjs';

test('getGitRepoRoot', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'pprr-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const repoDir = join(dir, 'repo');
  const nestedDir = join(repoDir, 'nested');
  const plainDir = join(dir, 'plain');

  execFileSync('git', ['init', repoDir], { stdio: 'pipe' });
  mkdirSync(nestedDir);
  mkdirSync(plainDir);

  await t.test('returns the repo root from nested directories', async () => {
    assert.equal(await getGitRepoRoot({ cwd: nestedDir }), repoDir);
  });

  await t.test('returns undefined outside a git repo', async () => {
    assert.equal(await getGitRepoRoot({ cwd: plainDir }), undefined);
  });
});
