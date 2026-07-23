import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const version = '1.22.0';
const expectedSha256 = '89220a7865076b342892f98865f3499fb7c4cfd673159e89d352c360fd014c6a';
const fileName = `ViGEmBus_${version}_x64_x86_arm64.exe`;
const url = `https://github.com/nefarius/ViGEmBus/releases/download/v${version}/${fileName}`;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destinationDirectory = path.join(root, 'resources', 'driver');
const destination = path.join(destinationDirectory, fileName);
const temporary = `${destination}.${process.pid}.download`;

await mkdir(destinationDirectory, { recursive: true });
const response = await globalThis.fetch(url, { redirect: 'follow' });
if (!response.ok || !response.body) throw new Error(`Driver download failed: ${response.status} ${response.statusText}`);

const hash = createHash('sha256');
const verifier = new Transform({
  transform(chunk, _encoding, callback) {
    hash.update(chunk);
    callback(null, chunk);
  },
});

try {
  await pipeline(Readable.fromWeb(response.body), verifier, createWriteStream(temporary, { mode: 0o600 }));
  const actualSha256 = hash.digest('hex');
  if (actualSha256 !== expectedSha256) {
    throw new Error(`ViGEmBus checksum mismatch. Expected ${expectedSha256}, received ${actualSha256}.`);
  }
  await rename(temporary, destination);
  process.stdout.write(`Verified ViGEmBus ${version}: ${destination}\n`);
} catch (error) {
  await rm(temporary, { force: true });
  throw error;
}
