import meow from 'meow';
import log, { setVerbose } from './lib/utils/log.mjs';
import { ExitPromptError } from '@inquirer/core';
import init from './lib/init.mjs';
import run from './lib/run.mjs';

/**
 * @param {unknown} reason
 */
const unhandledHandler = (reason) => {
  if (reason instanceof ExitPromptError) log.error('Form exited');
  else throw reason;
};

process.on('unhandledRejection', unhandledHandler);
process.on('uncaughtException', unhandledHandler);

const args = meow(
  `
    Usage
        $ poll-pull-reinstall-restart --init [-iv] [url [targetPath]]
        $ poll-pull-reinstall-restart [-v]

    Arguments
        url        (optional) Git repository URL to clone. Errors if already inside a
                    git repository. On retry after a failed clone the URL is pre-filled
                    so it can be corrected without retyping.
        targetPath (optional) The target path where to clone the repository.

      Options
        --init             Create a template .pprrc file and exit
                            (can be combined with --interactive | -i)
        --interactive, -i  Force interactive prompts on startup
                            (default: environment variables and .pprrc)
        --verbose, -v      Increase logging
        
    Environment
        RESTART_SCRIPTS    A comma-separated list of package.json scripts to run 
                            before the project is (re)started
        ONCE_SCRIPTS       (optional) A comma-separated list of package.json 
                            scripts to run on startup
        SSH_KEY_PATH       (optional) The path to the public key of the SSH key to 
                            use for this project for remote authentication
        INSTALL_DEV_PKGS   (default: false) Should devDependencies be installed
                            whenever project is (re)started
        POLL_INTERVAL      (default: 60) How many seconds between polls to remote 
                            for updates`,

  {
    helpIndent: 0,
    importMeta: import.meta,
    flags: {
      init: { type: 'boolean', default: false },
      interactive: { type: 'boolean', shortFlag: 'i', default: false },
      verbose: { type: 'boolean', shortFlag: 'v', default: false },
    },
  },
);

setVerbose(args.flags.verbose);

if (args.flags.init) {
  const url = args.input.at(0);
  const targetPath = args.input.at(1);
  await init({
    url,
    targetPath,
    isInteractive: args.flags.interactive,
  });
} else {
  await run();
}
