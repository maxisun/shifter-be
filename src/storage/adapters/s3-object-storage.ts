import type { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageConfig } from '../../config/config.js';
import {
  normalizePresignTtl,
  type ObjectBody,
  ObjectNotFoundError,
  type ObjectStorage,
  type PresignedDownload,
  type PutObjectInput,
  type StoredObject,
} from '../object-storage.js';

/**
 * R2's documented checksum support lags the AWS SDK's 2025 defaults. Setting
 * both knobs to WHEN_REQUIRED keeps single PutObject calls inside the subset
 * R2 documents and avoids aws-chunked streaming signatures.
 */
export function buildS3ClientConfig(storage: StorageConfig): S3ClientConfig {
  return {
    region: storage.region,
    endpoint: storage.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: storage.accessKeyId,
      secretAccessKey: storage.secretAccessKey,
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  };
}

export class S3ObjectStorage implements ObjectStorage {
  constructor(
    private readonly client: S3Client,
    private readonly presignClient: S3Client,
    private readonly bucket: string,
  ) {}

  async put(input: PutObjectInput): Promise<StoredObject> {
    const result = await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentLength: input.contentLength,
        ContentType: input.contentType,
        ContentDisposition: input.contentDisposition,
        CacheControl: input.cacheControl ?? 'private, no-store',
      }),
    );
    return { etag: result.ETag };
  }

  async get(key: string): Promise<ObjectBody> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!result.Body) {
        throw new Error('Stored object response had no body');
      }
      return {
        body: result.Body as Readable,
        contentLength: result.ContentLength,
        contentType: result.ContentType,
        contentDisposition: result.ContentDisposition,
      };
    } catch (error) {
      if (isMissingObject(error)) throw new ObjectNotFoundError(key);
      throw error;
    }
  }

  async presignGet(
    key: string,
    expiresInSeconds: number,
  ): Promise<PresignedDownload> {
    const seconds = normalizePresignTtl(expiresInSeconds);
    const url = await getSignedUrl(
      this.presignClient,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: seconds },
    );
    return {
      url,
      expiresAt: new Date(Date.now() + seconds * 1_000),
    };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}

export function createS3ObjectStorage(storage: StorageConfig): S3ObjectStorage {
  const client = new S3Client(buildS3ClientConfig(storage));
  const presignClient = storage.publicEndpoint
    ? new S3Client(
        buildS3ClientConfig({ ...storage, endpoint: storage.publicEndpoint }),
      )
    : client;
  return new S3ObjectStorage(client, presignClient, storage.bucket);
}

function isMissingObject(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as {
    name?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  return (
    candidate.name === 'NoSuchKey' ||
    candidate.$metadata?.httpStatusCode === 404
  );
}
