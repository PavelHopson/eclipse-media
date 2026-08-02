import { readFile, realpath, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const expectedName = 'hyperframes';
const expectedVersion = '0.7.88';
const packageRoot = resolve(workspace, 'node_modules', 'hyperframes');
const packageFile = resolve(packageRoot, 'package.json');

let manifest;
try {
  manifest = JSON.parse(await readFile(packageFile, 'utf8'));
} catch {
  console.error(
    `HyperFrames CLI ${expectedVersion} is not installed locally. ` +
    'The runner will not download or execute a package implicitly. ' +
    'After npm registry recovery, audit the exact package, add it to devDependencies and commit package-lock.json.',
  );
  process.exit(2);
}

if (manifest.name !== expectedName || manifest.version !== expectedVersion) {
  console.error(
    `Refusing HyperFrames ${manifest.name ?? 'unknown'}@${manifest.version ?? 'unknown'}; ` +
    `expected ${expectedName}@${expectedVersion}.`,
  );
  process.exit(3);
}

const relativeBin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.hyperframes;
if (!relativeBin) {
  console.error('The verified HyperFrames package does not expose a hyperframes binary.');
  process.exit(4);
}

const binCandidate = resolve(packageRoot, relativeBin);
if (!binCandidate.startsWith(`${packageRoot}${sep}`)) {
  console.error('Refusing a HyperFrames binary path outside its package directory.');
  process.exit(5);
}

let binPath;
try {
  const [realPackageRoot, realBinPath] = await Promise.all([
    realpath(packageRoot),
    realpath(binCandidate),
  ]);
  if (!realBinPath.startsWith(`${realPackageRoot}${sep}`) || !(await stat(realBinPath)).isFile()) {
    throw new Error('binary is not a regular file inside the package directory');
  }
  binPath = realBinPath;
} catch (error) {
  console.error(`Refusing an unsafe HyperFrames binary: ${error instanceof Error ? error.message : 'invalid path'}.`);
  process.exit(5);
}

const child = spawn(process.execPath, [binPath, ...process.argv.slice(2)], {
  cwd: workspace,
  stdio: 'inherit',
  shell: false,
});

child.once('error', (error) => {
  console.error(`Unable to start the local HyperFrames CLI: ${error.message}`);
  process.exitCode = 6;
});
child.once('exit', (code, signal) => {
  if (signal) {
    console.error(`HyperFrames stopped by signal ${signal}.`);
    process.exitCode = 7;
    return;
  }
  process.exitCode = code ?? 1;
});
