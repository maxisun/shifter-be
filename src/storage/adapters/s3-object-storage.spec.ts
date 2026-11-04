import { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { describeObjectStorageContract } from '../../../test/support/object-storage-contract.js';
import type { StorageConfig } from '../../config/config.js';
import { ObjectNotFoundError } from '../object-storage.js';
import {
  buildS3ClientConfig,
  createS3ObjectStorage,
  S3ObjectStorage,
} from './s3-object-storage.js';

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(),
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

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * In-memory stand-in for the S3 transport, so the port contract runs against
 * the real adapter code without network access.
 */
class FakeS3Client {
  private readonly objects = new Map<
    string,
    {
      body: Buffer;
      contentType: string;
      contentDisposition: string;
    }
  >();

  async send(command: unknown): Promise<unknown> {
    if (command instanceof PutObjectCommand) {
      const body = Buffer.isBuffer(command.input.Body)
        ? command.input.Body
        : await readAll(command.input.Body as Readable);
      this.objects.set(command.input.Key ?? '', {
        body,
        contentType: command.input.ContentType ?? '',
        contentDisposition: command.input.ContentDisposition ?? '',
      });
      return { ETag: '"etag"' };
    }
    if (command instanceof GetObjectCommand) {
      const object = this.objects.get(command.input.Key ?? '');
      if (!object) throw missingObjectError();
      return {
        Body: Readable.from(object.body),
        ContentLength: object.body.byteLength,
        ContentType: object.contentType,
        ContentDisposition: object.contentDisposition,
      };
    }
    if (command instanceof DeleteObjectCommand) {
      this.objects.delete(command.input.Key ?? '');
      return {};
    }
    throw new Error('Unsupported S3 command in test');
  }
}

function missingObjectError(): Error {
  return Object.assign(new Error('NoSuchKey'), {
    name: 'NoSuchKey',
    $metadata: { httpStatusCode: 404 },
  });
}

beforeEach(() => {
  vi.mocked(getSignedUrl).mockImplementation((_client, command) => {
    const key =
      command instanceof GetObjectCommand
        ? (command.input.Key ?? 'key')
        : 'key';
    return Promise.resolve(`https://signed.example/${key}`);
  });
});

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

  it('translates a missing S3 object into ObjectNotFoundError', async () => {
    vi.mocked(client.send).mockRejectedValue(missingObjectError());

    await expect(storage.get('missing')).rejects.toBeInstanceOf(
      ObjectNotFoundError,
    );
  });

  it('propagates non-missing S3 errors unchanged', async () => {
    vi.mocked(client.send).mockRejectedValue(new Error('network down'));

    await expect(storage.get('key')).rejects.toThrow('network down');
  });

  it('presigns a short-lived GET and caps the expiry at 15 minutes', async () => {
    const before = Date.now();
    const signed = await storage.presignGet('key', 86_400);

    expect(signed.url).toBe('https://signed.example/key');
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

describe('createS3ObjectStorage', () => {
  it('builds a client pair without a public endpoint', () => {
    expect(createS3ObjectStorage(storageConfig)).toBeInstanceOf(
      S3ObjectStorage,
    );
  });

  it('builds a separate presign client for a public endpoint', () => {
    expect(
      createS3ObjectStorage({
        ...storageConfig,
        publicEndpoint: 'http://localhost:9000',
      }),
    ).toBeInstanceOf(S3ObjectStorage);
  });
});

describeObjectStorageContract('S3ObjectStorage', () => {
  const client = new FakeS3Client();
  return new S3ObjectStorage(
    client as unknown as S3Client,
    client as unknown as S3Client,
    'shiftpatch',
  );
});
