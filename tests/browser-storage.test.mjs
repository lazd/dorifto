import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';

test('OPFS migrates only app data, survives reopening, and retains legacy data on write failure', async () => {
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  try {
    const { BrowserStorage } = await server.ssrLoadModule('/src/browser-storage.ts');
    const files = new Map();
    let fail = false;
    const directory = {
      async getDirectoryHandle() {
        return this;
      },
      async *values() {
        for (const name of files.keys()) yield await this.getFileHandle(name);
      },
      async getFileHandle(name) {
        return {
          kind: 'file',
          name,
          async getFile() {
            return new Blob([files.get(name)]);
          },
          async createWritable() {
            let pending;
            return {
              async write(value) {
                if (fail) throw new Error('Disk full');
                pending = value;
              },
              async close() {
                files.set(name, pending);
              },
              async abort() {},
            };
          },
        };
      },
      async removeEntry(name) {
        files.delete(name);
      },
    };
    const legacy = new Map([
      ['dorifto.laps.v1:course:run', 'recording'],
      ['dorifto:tuning-presets', 'presets'],
      ['dorifto:courses', 'legacy maps'],
      ['unrelated', 'keep'],
    ]);
    const storage = {
      get length() {
        return legacy.size;
      },
      key(i) {
        return [...legacy.keys()][i] ?? null;
      },
      getItem(key) {
        return legacy.get(key) ?? null;
      },
      removeItem(key) {
        legacy.delete(key);
      },
    };
    const errors = [];
    const first = new BrowserStorage();
    await first.open(directory, storage, (error) => errors.push(error));
    assert.equal(first.getItem('dorifto.laps.v1:course:run'), 'recording');
    assert.deepEqual([...legacy.keys()], ['dorifto:courses', 'unrelated']);
    first.setItem('new', 'saved');
    await first.flush();
    const reopened = new BrowserStorage();
    await reopened.open(directory, storage, (error) => errors.push(error));
    assert.equal(reopened.getItem('new'), 'saved');
    reopened.removeItem('new');
    await reopened.flush();
    assert.equal(files.has('new.json'), false);
    fail = true;
    legacy.set('dorifto.record.v1:new', 'important');
    await assert.rejects(
      new BrowserStorage().open(directory, storage, (error) => errors.push(error)),
      /Disk full/,
    );
    assert.equal(legacy.get('dorifto.record.v1:new'), 'important');
    assert.equal(errors.length, 1);
  } finally {
    await server.close();
  }
});
