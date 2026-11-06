import assertGitExists from './git/assertGitExists.mjs';
import getGitRepoRoot from './git/getGitRepoRoot.mjs';
import log from './utils/log.mjs';
import getPackageManagerInfo from './node/getPackageManagerInfo.mjs';
import execProjectInstall from './node/execProjectInstall.mjs';
import execNvm from './node/execNvm.mjs';
import ensurePackageManager from './node/ensurePackageManager.mjs';
import spawnSerial from './utils/spawnSerial.mjs';
import getEnv from './getEnv.mjs';
import createPullAndRestart from './git/pullAndRestart.mjs';
import notify from './utils/notify.mjs';
import pluralize from './utils/pluralize.mjs';

const run = async () => {
  await assertGitExists();

  const root = await getGitRepoRoot();
  if (!root) {
    log.error(`No git repository found in ${process.cwd()}`);
    process.exit(1);
  } else if (root !== process.cwd()) {
    log.verbose(`Changing current working directory to ${root}`);
    process.chdir(root);
  }

  const packageManager = await getPackageManagerInfo();
  const env = await getEnv();

  /** @type {NodeJS.Timeout|undefined} */
  let interval = undefined;
  let isAlreadyShuttingDown = false;
  const notifyExit = async (/** @type {NodeJS.Signals} */ signal) => {
    if (isAlreadyShuttingDown) return;
    isAlreadyShuttingDown = true;
    clearInterval(interval);
    await Promise.race([
      notify(env, { title: 'Service stopped' }),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]);
    process.kill(process.pid, signal);
  };
  process.once('SIGINT', notifyExit);
  process.once('SIGTERM', notifyExit);
  if (env.nvmAutoInstall) await execNvm();
  if (!(await ensurePackageManager(packageManager, env))) {
    throw new Error(`${packageManager.manager} not found, cannot start`);
  }
  const installExitCode = await execProjectInstall(
    packageManager,
    env.installDevPkgs,
  );
  if (installExitCode !== 0) {
    throw new Error(
      `${packageManager.manager} install exited with code ${installExitCode}, cannot start`,
    );
  }

  if (env.onceScripts.length > 0) {
    log.info(
      `Running ${env.onceScripts.length} "once" ${pluralize('script', env.onceScripts.length)}`,
    );
    await spawnSerial(packageManager, env.onceScripts).promise;
  }

  const pullAndRestart = createPullAndRestart();
  await pullAndRestart(env, packageManager);
  interval = setInterval(
    pullAndRestart,
    env.pollInterval * 1000,
    env,
    packageManager,
  );
};

export default run;
