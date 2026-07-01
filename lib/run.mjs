import assertGitExists from './git/assertGitExists.mjs';
import getGitRepoRoot from './git/getGitRepoRoot.mjs';
import log from './utils/log.mjs';
import getPackageManagerInfo from './node/getPackageManagerInfo.mjs';
import execProjectInstall from './node/execProjectInstall.mjs';
import execNvm from './node/execNvm.mjs';
import execCorepackEnable from './node/execCorepackEnable.mjs';
import spawnSerial from './utils/spawnSerial.mjs';
import getEnv from './getEnv.mjs';
import createPullAndRestart from './git/pullAndRestart.mjs';

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
  if (env.nvmAutoInstall) await execNvm();
  if (env.corepackEnable) await execCorepackEnable();
  await execProjectInstall(packageManager, env.installDevPkgs);

  if (env.onceScripts.length > 0) {
    log.info(`Running ${env.onceScripts.length} "once" script(s)`);
    await spawnSerial(packageManager, env.onceScripts).promise;
  }

  const pullAndRestart = createPullAndRestart();
  await pullAndRestart(env, packageManager);
  setInterval(pullAndRestart, env.pollInterval * 1000, env, packageManager);
};

export default run;
