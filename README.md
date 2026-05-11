# poll-pull-reinstall-restart

A daemon that watches a git remote and, on each poll: pulls, reinstalls dependencies if the working tree changed, and restarts a sequence of `package.json` scripts.

Useful for running a project on a server where deployments happen by pushing to a git branch.

## Requirements

- Node.js >= 22
- `git` on `PATH`
- `ssh-keygen` on `PATH` (only if generating a new SSH deploy key)

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

On startup it installs dependencies, runs any `ONCE_SCRIPTS` to completion, then enters the poll loop. On each poll it runs `git pull`; if the working tree changed it reinstalls and restarts `RESTART_SCRIPTS`.

## Configuration

Reads from `.pprrc` in the project root (dotenv format), falling back to environment variables.

| Variable          | Required | Default | Description |
|-------------------|----------|---------|-------------|
| `RESTART_SCRIPTS` | yes      | —       | Comma-separated `package.json` script names to run on each (re)start |
| `ONCE_SCRIPTS`    | no       | —       | Comma-separated scripts to run once on startup |
| `POLL_INTERVAL`   | no       | `60`    | Seconds between polls |
| `SSH_KEY_PATH`    | no       | —       | Path to SSH private key for git authentication |
| `INSTALL_DEV_PKGS`| no       | `false` | Install `devDependencies` on each reinstall |

## CLI flags

```
--init             Write a .pprrc file and exit
--interactive, -i  Prompt for settings interactively
--verbose, -v      Increase log output
```
