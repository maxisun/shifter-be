import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  normalizePresignTtl,
  type ObjectBody,
  ObjectNotFoundError,
  type ObjectStorage,
  type PresignedDownload,
  type PutObjectInput,
  type StoredObject,
} from '../object-storage.js';

interface StoredObjectRecord {
  body: Buffer;
  contentType: string;
  contentDisposition: string;
  etag: string;
}

/**
 * A real second adapter for the port: fast, deterministic, and free of AWS.
 * Use it in unit tests of feature services and in e2e tests that need stored
 * bytes without MinIO or R2.
 */
export class InMemoryObjectStorage implements ObjectStorage {
  private readonly objects = new Map<string, StoredObjectRecord>();

  async put(input: PutObjectInput): Promise<StoredObject> {
    const body = await toBuffer(input.body);
    if (body.byteLength !== input.contentLength) {
      throw new Error('In-memory storage received a mismatched content length');
    }
    const etag = `"${randomUUID()}"`;
    this.objects.set(input.key, {
      body,
      contentType: input.contentType,
      contentDisposition: input.contentDisposition,
      etag,
    });
    return { etag };
  }

  async get(key: string): Promise<ObjectBody> {
    const object = this.objects.get(key);
    if (!object) throw new ObjectNotFoundError(key);
    return {
      body: Readable.from(object.body),
      contentLength: object.body.byteLength,
      contentType: object.contentType,
      contentDisposition: object.contentDisposition,
    };
  }

  async presignGet(
    key: string,
    expiresInSeconds: number,
  ): Promise<PresignedDownload> {
    if (!this.objects.has(key)) throw new ObjectNotFoundError(key);
    const seconds = normalizePresignTtl(expiresInSeconds);
    const expiresAt = new Date(Date.now() + seconds * 1_000);
    return {
      url: `memory://object-storage/${key}?expires=${expiresAt.toISOString()}`,
      expiresAt,
    };
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

async function toBuffer(body: Buffer | Readable): Promise<Buffer> {
  if (Buffer.isBuffer(body)) return Buffer.from(body);
  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
