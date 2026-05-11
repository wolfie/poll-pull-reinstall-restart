import execFileAsync from '../utils/execFileAsync.mjs';
import log from '../utils/log.mjs';

const assertSshKeygenExists = () =>
  execFileAsync('ssh-keygen', ['-?'])
    .then(() => undefined)
    .catch((e) => {
      if (typeof e?.code === 'number') return;

      log.error("There was an issue running 'ssh-keygen'");
      process.exit(1);
    });

export default assertSshKeygenExists;
