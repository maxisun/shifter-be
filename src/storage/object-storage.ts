import type { Readable } from 'node:stream';

export type StorageContentType =
  | 'application/pdf'
  | 'image/jpeg'
  | 'image/png'
  | 'application/zip';

export interface PutObjectInput {
  key: string;
  body: Buffer | Readable;
  contentLength: number;
  contentType: StorageContentType;
  contentDisposition: string;
  cacheControl?: string;
}

export interface StoredObject {
  etag?: string;
}

export interface ObjectBody {
  body: Readable;
  contentLength?: number;
  contentType?: string;
  contentDisposition?: string;
}

export interface PresignedDownload {
  url: string;
  expiresAt: Date;
}

/**
 * The narrow storage surface the MVP needs. Callers never choose a bucket or
 * an object key supplied by a client; keys are built server-side from ids.
 */
export interface ObjectStorage {
  put(input: PutObjectInput): Promise<StoredObject>;
  get(key: string): Promise<ObjectBody>;
  presignGet(key: string, expiresInSeconds: number): Promise<PresignedDownload>;
  delete(key: string): Promise<void>;
}

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export class StorageNotConfiguredError extends Error {
  constructor() {
    super('Object storage is not configured');
    this.name = 'StorageNotConfiguredError';
  }
}

/**
 * Lets the service boot on a laptop without storage while still failing
 * loudly the moment a feature actually needs an object. Production config
 * validation prevents this adapter from being selected there.
 */
export class UnconfiguredObjectStorage implements ObjectStorage {
  async put(): Promise<StoredObject> {
    throw new StorageNotConfiguredError();
  }

  async get(): Promise<ObjectBody> {
    throw new StorageNotConfiguredError();
  }

  async presignGet(): Promise<PresignedDownload> {
    throw new StorageNotConfiguredError();
  }

  async delete(): Promise<void> {
    throw new StorageNotConfiguredError();
  }
}
