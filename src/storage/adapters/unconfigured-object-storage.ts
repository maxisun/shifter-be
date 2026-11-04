import {
  type ObjectBody,
  type ObjectStorage,
  type PresignedDownload,
  StorageNotConfiguredError,
  type StoredObject,
} from '../object-storage.js';

/**
 * Lets the service boot without storage while failing loudly the moment a
 * feature needs an object. Produced only when configuration is absent, which
 * production startup forbids.
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
