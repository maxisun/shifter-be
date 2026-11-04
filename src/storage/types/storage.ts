import type { Readable } from 'node:stream';

export type StorageContentType =
  | 'application/pdf'
  | 'image/jpeg'
  | 'image/png'
  | 'application/zip';

export interface StoreObjectInput {
  key: string;
  body: Buffer | Readable;
  /** Required for streams; derived for buffers. */
  contentLength?: number;
  contentType: StorageContentType;
  contentDisposition: string;
  cacheControl?: string;
}
