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
4. If `NVM_AUTO_INSTALL=true`, run `execNvm()` (bash subshell — see below).
5. `ensurePackageManager()` (see below). Missing package manager → throw.
6. Install deps via `execProjectInstall`. Non-zero exit → throw.
7. Run `ONCE_SCRIPTS` to completion (`await spawnSerial(...).promise`).
8. `createPullAndRestart()` → first call awaited → `setInterval` for subsequent polls.

### `pullAndRestart` is a factory, not a module singleton

`createPullAndRestart(deps?)` returns a closure holding the in-flight `locked` flag and the current spawn handle. Tests pass stubs for `execGitPull` / `execProjectInstall` / `execNvm` / `ensurePackageManager` / `spawnSerial` / `notify`; production calls it with no args. **Do not reintroduce module-level mutable state here** — the factory shape exists to make tests deterministic.

Poll body contract:
- Concurrent invocations short-circuit on `locked`.
- A `git pull` failure logs and returns — never crashes the daemon. The next tick retries.
- First run: skip nvm/ensurePackageManager/install, start restart scripts.
- Subsequent run, no upstream changes and no pending install: return.
- Subsequent run, changed: `killAll(1000)` → nvm (if `nvmAutoInstall`) → `ensurePackageManager` → install → spawn new restart chain.
- Missing package manager or non-zero install exit: log, notify once (`Install failed`), don't start scripts, set `installPending`. Every following tick retries nvm → ensure → install even without upstream changes, until it succeeds. Never throws.
- nvm failure is soft: install and restart proceed regardless. `execNvm`'s return value is not checked by the caller.

### nvm, corepack and package manager availability (`lib/node/`)

`execNvm()` runs `nvm install` by sourcing `$NVM_DIR/nvm.sh` inside a `bash -c` subshell. nvm output is redirected to stderr so the user sees it; the updated `$PATH` is printed to stdout, captured, and written back to `process.env.PATH` so subsequent `spawn` calls resolve binaries from the switched Node version. Call it only when `env.nvmAutoInstall` is true — that gate lives at the call site, not inside the function.

`execCorepackEnable()` is always a soft operation: ENOENT (no `corepack` binary) and non-zero exits are logged but never thrown. It returns `'ok' | 'missing' | 'failed'`.

Node >= 25 no longer bundles corepack, so pnpm/yarn may be absent after an nvm switch. `ensurePackageManager(packageManager, env)` owns this: runs `corepack enable` if `corepackEnable`; if corepack is `'missing'`, the manager isn't on PATH, `corepackAutoInstall` is true and the manager isn't npm, runs `npm install -g corepack` then `corepack enable` again. Returns whether the manager binary is on PATH (`findExecutable`, no subprocess), logging an actionable error if not. Never throws; callers decide (startup throws, poll retries). `COREPACK_AUTO_INSTALL` defaults to `false` — it's a global install and needs explicit consent, asked during `--init -i`. Never prompt for it in run mode: the daemon usually has no TTY, and during a poll the old scripts are already killed.

`execProjectInstall` never rejects: spawn errors are logged and returned as exit code `-1`.

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
