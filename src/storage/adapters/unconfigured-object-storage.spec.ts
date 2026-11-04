import { StorageNotConfiguredError } from '../object-storage.js';
import { UnconfiguredObjectStorage } from './unconfigured-object-storage.js';

describe('UnconfiguredObjectStorage', () => {
  const storage = new UnconfiguredObjectStorage();

  it.each([
    ['put', () => storage.put()],
    ['get', () => storage.get()],
    ['presignGet', () => storage.presignGet()],
    ['delete', () => storage.delete()],
  ])('throws on %s', async (_name, operation) => {
    await expect(operation()).rejects.toThrow(StorageNotConfiguredError);
  });
});
