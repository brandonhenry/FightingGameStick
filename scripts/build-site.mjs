import { copyFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(projectRoot, 'netlify-dist');

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(path.join(outputDirectory, 'assets', 'icons'), { recursive: true });
await Promise.all([
  copyFile(path.join(projectRoot, 'download.html'), path.join(outputDirectory, 'index.html')),
  copyFile(
    path.join(projectRoot, 'assets', 'icons', 'app.png'),
    path.join(outputDirectory, 'assets', 'icons', 'app.png'),
  ),
]);

process.stdout.write(`Prepared Netlify site in ${path.relative(projectRoot, outputDirectory)}/\n`);
