import { describeObjectStorageContract } from '../../../test/support/object-storage-contract.js';
import { InMemoryObjectStorage } from './in-memory-object-storage.js';

describeObjectStorageContract(
  'InMemoryObjectStorage',
  () => new InMemoryObjectStorage(),
);

describe('InMemoryObjectStorage test adapter', () => {
  it('rejects a body whose declared length is wrong', async () => {
    const storage = new InMemoryObjectStorage();

    await expect(
      storage.put({
        key: 'contract/object',
        body: Buffer.from('three'),
        contentLength: 1,
        contentType: 'application/pdf',
        contentDisposition: 'attachment',
      }),
    ).rejects.toThrow('mismatched content length');
  });
});
