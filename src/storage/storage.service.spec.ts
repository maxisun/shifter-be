import { Readable } from 'node:stream';
import { InMemoryObjectStorage } from './adapters/in-memory-object-storage.js';
import { UnconfiguredObjectStorage } from './adapters/unconfigured-object-storage.js';
import {
  InvalidStorageInputError,
  ObjectNotFoundError,
  type ObjectStorage,
  StorageNotConfiguredError,
} from './object-storage.js';
import { StorageService } from './storage.service.js';

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function createService() {
  return new StorageService(new InMemoryObjectStorage());
}

function input(
  overrides: Partial<Parameters<StorageService['store']>[0]> = {},
) {
  const body = Buffer.from('%PDF-1.4 contract');
  return {
    key: 'credentials/nurse/credential',
    body,
    contentType: 'application/pdf' as const,
    contentDisposition: 'attachment; filename="credential.pdf"',
    ...overrides,
  };
}

describe('StorageService', () => {
  it('stores a buffer, derives its length, and reads it back', async () => {
    const service = createService();
    const body = Buffer.from('%PDF-1.4 contract');

    await service.store(input());

    const object = await service.read('credentials/nurse/credential');
    expect(await readAll(object.body)).toEqual(body);
    expect(object).toMatchObject({
      contentLength: body.byteLength,
      contentType: 'application/pdf',
      contentDisposition: 'attachment; filename="credential.pdf"',
    });
  });

  it('stores a stream when the caller supplies its length', async () => {
    const service = createService();
    const body = Buffer.from('streamed bytes');

    await service.store(
      input({
        body: Readable.from(body),
        contentLength: body.byteLength,
        contentType: 'image/png',
      }),
    );

    const object = await service.read('credentials/nurse/credential');
    expect(await readAll(object.body)).toEqual(body);
  });

  it('requires a length for a stream body', async () => {
    const service = createService();

    await expect(
      service.store(input({ body: Readable.from('bytes') })),
    ).rejects.toThrow('contentLength is required for a stream body');
  });

  it('rejects a buffer whose supplied length is wrong', async () => {
    const service = createService();

    await expect(service.store(input({ contentLength: 1 }))).rejects.toThrow(
      'contentLength does not match the buffer length',
    );
  });

  it('rejects an empty body', async () => {
    const service = createService();

    await expect(
      service.store(input({ body: Buffer.alloc(0) })),
    ).rejects.toThrow('Object body is empty');
  });

  it('enforces the content-type allowlist at runtime', async () => {
    const service = createService();

    await expect(
      service.store(
        input({
          contentType: 'text/plain' as unknown as 'application/pdf',
        }),
      ),
    ).rejects.toThrow('Unsupported content type: text/plain');
  });

  it.each([
    ['empty', ''],
    ['absolute', '/credentials/nurse'],
    ['traversal', 'credentials/../../secret'],
    ['duplicate separator', 'credentials//nurse'],
    ['trailing separator', 'credentials/'],
    ['too long', 'a'.repeat(1025)],
    ['space', 'credentials/my file'],
  ])('rejects an invalid key (%s)', async (_name, key) => {
    const service = createService();
    await expect(service.store(input({ key }))).rejects.toBeInstanceOf(
      InvalidStorageInputError,
    );
    await expect(service.read(key)).rejects.toBeInstanceOf(
      InvalidStorageInputError,
    );
    await expect(service.remove(key)).rejects.toBeInstanceOf(
      InvalidStorageInputError,
    );
  });

  it('creates a download link capped at 15 minutes', async () => {
    const service = createService();
    await service.store(input());

    const link = await service.createDownloadLink(
      'credentials/nurse/credential',
      86_400,
    );

    expect(link.url).toContain('credentials/nurse/credential');
    expect(link.expiresAt.getTime()).toBeGreaterThan(Date.now() + 895_000);
  });

  it('creates a one-second link for a non-positive TTL', async () => {
    const service = createService();
    await service.store(input());

    const link = await service.createDownloadLink(
      'credentials/nurse/credential',
      0,
    );

    expect(link.expiresAt.getTime()).toBeLessThan(Date.now() + 5_000);
  });

  it('rejects a non-numeric TTL', async () => {
    const service = createService();
    await service.store(input());

    await expect(
      service.createDownloadLink('credentials/nurse/credential', Number.NaN),
    ).rejects.toThrow('Presign expiry must be a number');
  });

  it('removes an object, after which reads report not found', async () => {
    const service = createService();
    await service.store(input());

    await service.remove('credentials/nurse/credential');

    await expect(
      service.read('credentials/nurse/credential'),
    ).rejects.toBeInstanceOf(ObjectNotFoundError);
  });

  it('passes the safe cache default to the adapter', async () => {
    const put = vi.fn().mockResolvedValue({});
    const adapter = { put } as unknown as ObjectStorage;
    const service = new StorageService(adapter);
    const body = Buffer.from('bytes');

    await service.store(
      input({ body, contentDisposition: 'attachment; filename="x.pdf"' }),
    );

    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({
        contentLength: body.byteLength,
        cacheControl: 'private, no-store',
      }),
    );
  });

  it('preserves an explicit cache control', async () => {
    const put = vi.fn().mockResolvedValue({});
    const service = new StorageService({ put } as unknown as ObjectStorage);

    await service.store(input({ cacheControl: 'public, max-age=60' }));

    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({ cacheControl: 'public, max-age=60' }),
    );
  });

  it('propagates the unconfigured adapter error', async () => {
    const service = new StorageService(new UnconfiguredObjectStorage());

    await expect(service.store(input())).rejects.toBeInstanceOf(
      StorageNotConfiguredError,
    );
  });
});
