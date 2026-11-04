import type { Readable } from 'node:stream';

export type StorageContentType =
  | 'application/pdf'
  | 'image/jpeg'
  | 'image/png'
  | 'application/zip';

export const SUPPORTED_CONTENT_TYPES: readonly StorageContentType[] = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/zip',
];

const supportedContentTypes = new Set<string>(SUPPORTED_CONTENT_TYPES);

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

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export class StorageNotConfiguredError extends Error {
  constructor() {
    super('Object storage is not configured');
    this.name = 'StorageNotConfiguredError';
  }
}

export class InvalidStorageInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidStorageInputError';
  }
}

export class ObjectNotFoundError extends Error {
  constructor(readonly key: string) {
    super('Object not found');
    this.name = 'ObjectNotFoundError';
  }
}

export function isSupportedContentType(
  value: string,
): value is StorageContentType {
  return supportedContentTypes.has(value);
}

/**
 * Object keys are server-built from opaque IDs. Reject traversal, absolute
 * keys, duplicate separators, control characters, and the S3 1024-byte limit
 * before a value reaches an adapter.
 */
export function assertObjectKey(key: string): string {
  if (typeof key !== 'string' || key.length === 0) {
    throw new InvalidStorageInputError('Object key is required');
  }
  if (Buffer.byteLength(key, 'utf8') > 1024) {
    throw new InvalidStorageInputError('Object key must be at most 1024 bytes');
  }
  if (
    key.startsWith('/') ||
    key.endsWith('/') ||
    key.includes('//') ||
    key.includes('..')
  ) {
    throw new InvalidStorageInputError('Object key contains an invalid path');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(key)) {
    throw new InvalidStorageInputError(
      'Object key contains invalid characters',
    );
  }
  return key;
}

/**
 * R2 accepts 1 second to 7 days; product download links are short lived, so
 * every adapter and the service clamp to 15 minutes.
 */
export function normalizePresignTtl(seconds: number): number {
  if (!Number.isFinite(seconds)) {
    throw new InvalidStorageInputError('Presign expiry must be a number');
  }
  return Math.max(1, Math.min(Math.floor(seconds), 900));
}
