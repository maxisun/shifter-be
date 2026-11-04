import type { Readable } from 'node:stream';
import { ObjectNotFoundError } from '../../src/storage/object-storage.js';
import type { ObjectStorage } from '../../src/storage/types/object-storage.js';

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Every storage adapter must behave the same at the port. Run this against a
 * new adapter before wiring it into StorageModule.
 */
export function describeObjectStorageContract(
  name: string,
  createStorage: () => ObjectStorage,
): void {
  describe(`${name} object storage contract`, () => {
    const key = 'contract/object';
    const payload = Buffer.from('contract payload');

    function input() {
      return {
        key,
        body: payload,
        contentLength: payload.byteLength,
        contentType: 'application/pdf' as const,
        contentDisposition: 'attachment; filename="contract.pdf"',
      };
    }

    it('stores and reads the exact bytes and metadata', async () => {
      const storage = createStorage();

      await storage.put(input());
      const object = await storage.get(key);

      expect(await readAll(object.body)).toEqual(payload);
      expect(object).toMatchObject({
        contentLength: payload.byteLength,
        contentType: 'application/pdf',
        contentDisposition: 'attachment; filename="contract.pdf"',
      });
    });

    it('presigns a URL and clamps the expiry to 1..900 seconds', async () => {
      const storage = createStorage();
      await storage.put(input());

      const capped = await storage.presignGet(key, 86_400);
      expect(capped.url).toContain(key);
      expect(capped.expiresAt.getTime()).toBeGreaterThan(Date.now() + 895_000);

      const floor = await storage.presignGet(key, 0);
      expect(floor.expiresAt.getTime()).toBeLessThan(Date.now() + 5_000);
    });

    it('deletes the object and reports it missing afterwards', async () => {
      const storage = createStorage();
      await storage.put(input());

      await storage.delete(key);

      await expect(storage.get(key)).rejects.toBeInstanceOf(
        ObjectNotFoundError,
      );
    });

    it('reports a missing object without adapter-specific errors', async () => {
      const storage = createStorage();
      await expect(storage.get('contract/missing')).rejects.toBeInstanceOf(
        ObjectNotFoundError,
      );
    });
  });
}
