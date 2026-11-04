import { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageConfig } from '../config/config.js';
import {
  StorageNotConfiguredError,
  UnconfiguredObjectStorage,
} from './object-storage.js';
import {
  buildS3ClientConfig,
  createObjectStorage,
  S3ObjectStorage,
} from './s3-object-storage.js';

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://signed.example/object'),
}));

const storageConfig: StorageConfig = {
  endpoint: 'https://account.r2.cloudflarestorage.com',
  region: 'auto',
  bucket: 'shiftpatch',
  accessKeyId: 'access',
  secretAccessKey: 'secret',
};

function fakeClient(send: ReturnType<typeof vi.fn>) {
  return { send } as unknown as S3Client;
}

describe('buildS3ClientConfig', () => {
  it('disables the AWS checksum defaults for R2 and uses path-style URLs', () => {
    expect(buildS3ClientConfig(storageConfig)).toMatchObject({
      region: 'auto',
      endpoint: 'https://account.r2.cloudflarestorage.com',
      forcePathStyle: true,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      credentials: {
        accessKeyId: 'access',
        secretAccessKey: 'secret',
      },
    });
  });
});

describe('S3ObjectStorage', () => {
  const client = fakeClient(vi.fn());
  const storage = new S3ObjectStorage(client, client, 'shiftpatch');

  beforeEach(() => {
    vi.mocked(client.send).mockReset();
  });

  it('puts an object with explicit length, type and disposition', async () => {
    vi.mocked(client.send).mockResolvedValue({ ETag: '"etag"' });
    const body = Buffer.from('%PDF-1.4');

    await expect(
      storage.put({
        key: 'credentials/nurse/credential',
        body,
        contentLength: body.byteLength,
        contentType: 'application/pdf',
        contentDisposition: 'attachment; filename="credential.pdf"',
      }),
    ).resolves.toEqual({ etag: '"etag"' });

    const command = vi.mocked(client.send).mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: 'shiftpatch',
      Key: 'credentials/nurse/credential',
      Body: body,
      ContentLength: body.byteLength,
      ContentType: 'application/pdf',
      ContentDisposition: 'attachment; filename="credential.pdf"',
      CacheControl: 'private, no-store',
    });
  });

  it('gets an object and returns its stream and metadata', async () => {
    const stream = Readable.from([Buffer.from('bytes')]);
    vi.mocked(client.send).mockResolvedValue({
      Body: stream,
      ContentLength: 5,
      ContentType: 'application/pdf',
      ContentDisposition: 'attachment',
    });

    const object = await storage.get('credentials/nurse/credential');

    expect(object.body).toBe(stream);
    expect(object).toMatchObject({
      contentLength: 5,
      contentType: 'application/pdf',
      contentDisposition: 'attachment',
    });
    expect(vi.mocked(client.send).mock.calls[0]?.[0]).toBeInstanceOf(
      GetObjectCommand,
    );
  });

  it('fails loudly when a stored object has no body', async () => {
    vi.mocked(client.send).mockResolvedValue({});
    await expect(storage.get('key')).rejects.toThrow(
      'Stored object response had no body',
    );
  });

  it('presigns a short-lived GET and caps the expiry at 15 minutes', async () => {
    const before = Date.now();
    const signed = await storage.presignGet('key', 86_400);

    expect(signed.url).toBe('https://signed.example/object');
    expect(signed.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 900_000);
    expect(getSignedUrl).toHaveBeenCalledWith(
      client,
      expect.any(GetObjectCommand),
      { expiresIn: 900 },
    );
  });

  it('presigns for at least one second', async () => {
    await storage.presignGet('key', 0);
    expect(getSignedUrl).toHaveBeenCalledWith(
      client,
      expect.any(GetObjectCommand),
      { expiresIn: 1 },
    );
  });

  it('deletes an object', async () => {
    vi.mocked(client.send).mockResolvedValue({});
    await storage.delete('key');
    expect(vi.mocked(client.send).mock.calls[0]?.[0]).toBeInstanceOf(
      DeleteObjectCommand,
    );
  });
});

describe('createObjectStorage', () => {
  it('builds a client pair without a public endpoint', () => {
    expect(createObjectStorage(storageConfig)).toBeInstanceOf(S3ObjectStorage);
  });

  it('builds a separate presign client for a public endpoint', () => {
    expect(
      createObjectStorage({
        ...storageConfig,
        publicEndpoint: 'http://localhost:9000',
      }),
    ).toBeInstanceOf(S3ObjectStorage);
  });
});

describe('UnconfiguredObjectStorage', () => {
  const storage = new UnconfiguredObjectStorage();

  it.each([
    ['put', () => storage.put()],
    ['get', () => storage.get()],
    ['presignGet', () => storage.presignGet()],
    ['delete', () => storage.delete()],
  ])('throws on %s', async (_name, operation) => {
    await expect(operation()).rejects.toThrow(StorageNotConfiguredError);
  });
});
