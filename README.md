# poll-pull-reinstall-restart

A daemon that watches a git remote and, on each poll: pulls, reinstalls dependencies if the working tree changed, and restarts a sequence of `package.json` scripts.

Useful for running a project on a server where deployments happen by pushing to a git branch.

## Requirements

- Node.js >= 22
- `git` on `PATH`
- `ssh-keygen` on `PATH` (only if generating a new SSH deploy key)
- `nvm` (only if using `NVM_AUTO_INSTALL` or relying on `.nvmrc`)

## Usage

### 1. Create a config (`--init`)

Run once in a project directory to write a `.pprrc` file:

```sh
npx poll-pull-reinstall-restart --init
```

Add `--interactive` (or `-i`) to be prompted for each setting:

```sh
npx poll-pull-reinstall-restart --init -i
```

To clone a repository first, pass the URL:

```sh
npx poll-pull-reinstall-restart --init git@github.com:user/repo.git
```

`.pprrc` is a dotenv file. Commit it or keep it local — it has no secrets unless you set `SSH_KEY_PATH`.

### 2. Run the daemon

Once a `.pprrc` exists (or the required environment variables are set), start the daemon:

```sh
npx poll-pull-reinstall-restart
```

On startup it optionally runs `nvm install` (if `NVM_AUTO_INSTALL=true` and `.nvmrc` is present), optionally runs `corepack enable`, checks that the project's package manager is on `PATH`, installs dependencies, runs any `ONCE_SCRIPTS` to completion, then enters the poll loop. On each poll it runs `git pull`; if the working tree changed it re-runs nvm/corepack, reinstalls, and restarts `RESTART_SCRIPTS`. If the reinstall fails (or the package manager is missing), the restart scripts stay stopped and the install is retried on every poll until it succeeds.

Node 25 and later no longer bundle corepack. For pnpm and yarn projects, pprr then needs `pnpm`/`yarn` installed for the active Node version, or `COREPACK_AUTO_INSTALL=true` to let it run `npm install -g corepack` itself. `--init -i` asks for this permission; it is never assumed.

If `NTFY_TOPIC` is set, lifecycle events (service started, update detected, restart failures, git pull failures, and shutdown) are pushed as [ntfy](https://ntfy.sh) notifications to that topic.

## Configuration

Reads from `.pprrc` in the project root (dotenv format), falling back to environment variables.

| Variable                | Required | Default           | Description                                                                                                        |
| ----------------------- | -------- | ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| `RESTART_SCRIPTS`       | yes      | —                 | Comma-separated `package.json` script names to run on each (re)start                                               |
| `ONCE_SCRIPTS`          | no       | —                 | Comma-separated scripts to run once on startup                                                                     |
| `POLL_INTERVAL`         | no       | `60`              | Seconds between polls                                                                                              |
| `SSH_KEY_PATH`          | no       | —                 | Path to SSH private key for git authentication                                                                     |
| `INSTALL_DEV_PKGS`      | no       | `false`           | Install `devDependencies` on each reinstall                                                                        |
| `NVM_AUTO_INSTALL`      | no       | `true`            | Run `nvm install` on startup and on each changed pull (requires `.nvmrc` and nvm)                                  |
| `COREPACK_ENABLE`       | no       | `true`            | Run `corepack enable` after each Node version switch                                                               |
| `COREPACK_AUTO_INSTALL` | no       | `false`           | If pnpm/yarn and corepack are both missing (Node 25+), run `npm install -g corepack`. Needs `COREPACK_ENABLE=true` |
| `SERVICE_NAME`          | no       | —                 | Label prepended to ntfy notification titles, e.g. `[my-app] Service started`                                       |
| `NTFY_TOPIC`            | no       | —                 | [ntfy](https://ntfy.sh) topic to send lifecycle notifications to                                                   |
| `NTFY_SERVER`           | no       | `https://ntfy.sh` | ntfy server base URL                                                                                               |

## CLI flags

```
--init             Write a .pprrc file and exit
--interactive, -i  Prompt for settings interactively
--verbose, -v      Increase log output
```
