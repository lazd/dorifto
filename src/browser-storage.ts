/** Synchronous session reads backed by ordered, durable OPFS writes. */
export class BrowserStorage implements Storage {
  private readonly values = new Map<string, string>();
  private pending = Promise.resolve();
  private directory?: FileSystemDirectoryHandle;
  private reportError: (error: unknown) => void = console.error;

  async open(
    root: FileSystemDirectoryHandle,
    legacy: Storage,
    reportError: (error: unknown) => void,
  ) {
    this.reportError = reportError;
    this.directory = await root.getDirectoryHandle('dorifto-data', { create: true });
    for await (const handle of this.directory.values()) {
      if (handle.kind !== 'file' || !handle.name.endsWith('.json')) continue;
      const key = decodeURIComponent(handle.name.slice(0, -5));
      this.values.set(key, await (await handle.getFile()).text());
    }
    const keys = Array.from({ length: legacy.length }, (_, i) => legacy.key(i)!);
    for (const key of keys) {
      if (
        !key.startsWith('dorifto.laps.v1:') &&
        !key.startsWith('dorifto.record.v1:') &&
        key !== 'dorifto:tuning-presets' &&
        key !== 'dorifto.input-bindings.v1'
      )
        continue;
      const value = legacy.getItem(key);
      if (value === null) continue;
      if (!this.values.has(key)) {
        this.setItem(key, value);
        await this.flush();
      }
      legacy.removeItem(key);
    }
  }

  get length() {
    return this.values.size;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    const directory = this.requireDirectory();
    this.values.set(key, value);
    this.enqueue(async () => {
      const handle = await directory.getFileHandle(`${encodeURIComponent(key)}.json`, {
        create: true,
      });
      const writable = await handle.createWritable();
      try {
        await writable.write(value);
        await writable.close();
      } catch (error) {
        await writable.abort();
        throw error;
      }
    });
  }
  removeItem(key: string) {
    const directory = this.requireDirectory();
    if (!this.values.delete(key)) return;
    this.enqueue(() => directory.removeEntry(`${encodeURIComponent(key)}.json`));
  }
  clear() {
    for (const key of this.values.keys()) this.removeItem(key);
  }
  async flush() {
    await this.pending;
  }
  private requireDirectory() {
    if (!this.directory) throw new Error('Persistent browser storage is not initialized');
    return this.directory;
  }
  private enqueue(write: () => Promise<void>) {
    this.pending = this.pending.then(write);
    void this.pending.catch(this.reportError);
  }
}

export const browserStorage = new BrowserStorage();

export async function flushBrowserStorage(storage: Storage) {
  if (storage instanceof BrowserStorage) await storage.flush();
}
