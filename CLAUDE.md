# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`poll-pull-reinstall-restart` (pprr) is a CLI daemon that watches a git remote and, on each poll: pulls, reinstalls deps if the working tree changed, and restarts a configured sequence of `package.json` scripts. Two modes:

- `--init` — interactive setup that writes a `.pprrc` dotenv file (and optionally clones the repo first)
- default — run mode, loops forever

## Commands

```bash
pnpm test                                       # all tests
node --test path/to/file.test.mjs               # one file
node --test --test-name-pattern '<regex>'       # filter by test name
pnpm run check                                  # format + lint + tsc --noEmit (CI-equivalent)
```

`pnpm run check` is the source of truth before claiming done.

## Architecture

### Run-mode lifecycle (`lib/run.mjs`)

1. Assert `git` exists, locate repo root, chdir if needed.
2. Detect package manager (`getPackageManagerInfo` — by lockfile name).
3. Load `.pprrc` via `getEnv` (dotenv). `RESTART_SCRIPTS` is required.
4. Run `ONCE_SCRIPTS` to completion (`await spawnSerial(...).promise`).
5. `createPullAndRestart()` → first call awaited → `setInterval` for subsequent polls.

### `pullAndRestart` is a factory, not a module singleton

`createPullAndRestart(deps?)` returns a closure holding the in-flight `locked` flag and the current spawn handle. Tests pass stub `execGitPull` / `execProjectInstall` / `spawnSerial`; production calls it with no args. **Do not reintroduce module-level mutable state here** — the factory shape exists to make tests deterministic.

Poll body contract:
- Concurrent invocations short-circuit on `locked`.
- A `git pull` failure logs and returns — never crashes the daemon. The next tick retries.
- First run: skip install, start restart scripts.
- Subsequent run, no upstream changes: return.
- Subsequent run, changed: `killAll(1000)` → install → spawn new restart chain.

### spawn / spawnSerial (`lib/utils/`)

`spawn` wraps `child_process.spawn` and returns `{ child, promise, kill, getStdErr }`:
- `promise` resolves with the exit code on `'close'`, rejects on `'error'` (e.g. ENOENT).
- `captureStdErr: true` buffers stderr for later inspection via `getStdErr()` (still also written through to the user's terminal with a prefix).
- `kill(timeoutMs)` uses `tree-kill`; throws if the child doesn't die in time (only when `timeoutMs > 0`).

`spawnSerial` runs scripts in order. Contract:
- Any non-zero exit → outer `promise` rejects with `Script "<name>" exited with code <N>`. Chain stops.
- `killAll()` → outer `promise` resolves cleanly. Remaining scripts skipped.

`pullAndRestart` deliberately attaches a `.catch` to the restart-script promise so a failing user script logs and lets the daemon keep polling. If you change that wiring, preserve that guarantee — an unhandled rejection here crashes the process via `index.mjs`'s top-level handlers.

### Type checking via JSDoc

No `.ts` files — everything is `.mjs` with JSDoc, and `tsconfig.json` runs `tsc --noEmit` with `checkJs`, `strict`, `allowJs`. Annotate new exports with `@param` / `@returns` / `@typedef`. Use `/** @type {PromiseWithResolvers<T>} */ (Promise.withResolvers())` for `withResolvers` — its return type defaults to `unknown`.

### Tests

- `node:test` only. No vitest, no jest.
- Test files colocate with source: `foo.mjs` + `foo.test.mjs` in the same directory.
- Default to integration tests with real subprocesses (`git`, `node -e ...`) in real `tmpdir` paths. Use `t.mock.method` only at the exit boundary (`process.exit`, `console.*`) or to silence `process.stderr.write` during spawn tests.
- Do **not** mock `process.stdout.write` — the test reporter writes to it.
- If a future change forces module-level mocking, the agreed escape hatch is vitest. `node:test`'s `mock.module` is experimental and not adopted here.

## Conventions

- All Node built-in imports use the `node:` prefix.
- `process.exit` calls live only in leaf modules (`assert*Exists`, `getPackageManagerInfo`, `getEnv`, `init`). Orchestrators return results or throw — they don't exit.
- Log via `lib/utils/log.mjs` (`log.info` / `log.error` / `log.verbose`), not bare `console.*`. `verbose` is gated by `setVerbose(true)` from the `-v` flag.
- `splitEnvVarArray` in `lib/utils/` is the canonical reader for comma-separated env values; it correctly handles unset, empty, and whitespace-only.
