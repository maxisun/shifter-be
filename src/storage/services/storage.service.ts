import type { Readable } from 'node:stream';
import { Inject, Injectable } from '@nestjs/common';
import {
  assertObjectKey,
  InvalidStorageInputError,
  isSupportedContentType,
  normalizePresignTtl,
  OBJECT_STORAGE,
} from '../object-storage.js';
import type {
  ObjectBody,
  ObjectStorage,
  PresignedDownload,
  StoredObject,
} from '../types/object-storage.js';
import type { StoreObjectInput } from '../types/storage.js';

export const DEFAULT_CACHE_CONTROL = 'private, no-store';
export const DEFAULT_PRESIGN_TTL_SECONDS = 900;

/**
 * The public storage interface feature code injects. It owns key and
 * content-length validation, the content-type allowlist, cache defaults, and
 * TTL policy; an adapter only talks to a blob store.
 */
@Injectable()
export class StorageService {
  constructor(
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  async store(input: StoreObjectInput): Promise<StoredObject> {
    const key = assertObjectKey(input.key);
    if (!isSupportedContentType(input.contentType)) {
      throw new InvalidStorageInputError(
        `Unsupported content type: ${input.contentType}`,
      );
    }
    return this.storage.put({
      key,
      body: input.body,
      contentLength: resolveContentLength(input.body, input.contentLength),
      contentType: input.contentType,
      contentDisposition: input.contentDisposition,
      cacheControl: input.cacheControl ?? DEFAULT_CACHE_CONTROL,
    });
  }

  async read(key: string): Promise<ObjectBody> {
    return this.storage.get(assertObjectKey(key));
  }

  async createDownloadLink(
    key: string,
    expiresInSeconds = DEFAULT_PRESIGN_TTL_SECONDS,
  ): Promise<PresignedDownload> {
    return this.storage.presignGet(
      assertObjectKey(key),
      normalizePresignTtl(expiresInSeconds),
    );
  }

  async remove(key: string): Promise<void> {
    await this.storage.delete(assertObjectKey(key));
  }
}

function resolveContentLength(
  body: Buffer | Readable,
  provided: number | undefined,
): number {
  if (Buffer.isBuffer(body)) {
    if (body.byteLength === 0) {
      throw new InvalidStorageInputError('Object body is empty');
    }
    if (provided !== undefined && provided !== body.byteLength) {
      throw new InvalidStorageInputError(
        'contentLength does not match the buffer length',
      );
    }
    return body.byteLength;
  }

  if (!Number.isInteger(provided) || (provided ?? 0) < 1) {
    throw new InvalidStorageInputError(
      'contentLength is required for a stream body',
    );
  }
  return provided as number;
}
