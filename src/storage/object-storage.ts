import type { StorageContentType } from './types/storage.js';

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export const SUPPORTED_CONTENT_TYPES: readonly StorageContentType[] = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/zip',
];

const supportedContentTypes = new Set<string>(SUPPORTED_CONTENT_TYPES);

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
