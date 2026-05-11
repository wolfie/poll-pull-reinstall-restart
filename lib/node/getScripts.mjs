import fs from 'fs/promises';
import path from 'path';

const getPackageJsonPath = () => path.resolve(process.cwd(), 'package.json');

/**
 * @returns {Promise<{ [script: string]: string }>}
 */
const getScripts = () =>
  fs
    .readFile(getPackageJsonPath(), 'utf-8')
    .then((contents) => JSON.parse(contents).scripts);

export default getScripts;
