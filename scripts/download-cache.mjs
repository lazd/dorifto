import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultCacheDir = fileURLToPath(new URL('../road-imports/cache/', import.meta.url));

export function createDownloadCache({
  cacheDir = defaultCacheDir,
  prefix = 'geographic',
  extension = 'bin',
} = {}) {
  const cacheFile = (url) =>
    path.join(cacheDir, `${prefix}-${createHash('sha256').update(url).digest('hex')}.${extension}`);
  return {
    async read(url) {
      try {
        return await readFile(cacheFile(url));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    },
    async write(url, bytes) {
      await mkdir(cacheDir, { recursive: true });
      const file = cacheFile(url);
      const temporary = `${file}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, bytes, { flag: 'wx' });
        await rename(temporary, file);
      } finally {
        await rm(temporary, { force: true });
      }
    },
  };
}
