import type { Readable } from 'node:stream';
import type { StorageContentType } from './storage.js';

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
 * The low-level seam between the storage service and a blob-store adapter.
 * Feature code must not inject this port; it is internal to the storage
 * module. `StorageService` is the public interface.
 */
export interface ObjectStorage {
  put(input: PutObjectInput): Promise<StoredObject>;
  get(key: string): Promise<ObjectBody>;
  presignGet(key: string, expiresInSeconds: number): Promise<PresignedDownload>;
  delete(key: string): Promise<void>;
}
