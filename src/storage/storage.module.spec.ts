import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppConfigModule } from '../config/app-config.module.js';
import { APP_CONFIG, loadConfig } from '../config/config.js';
import { StorageNotConfiguredError } from './object-storage.js';
import { StorageModule } from './storage.module.js';
import { StorageService } from './storage.service.js';

@Injectable()
class StorageConsumer {
  constructor(readonly storage: StorageService) {}
}

describe('StorageModule', () => {
  it('injects StorageService into another Nest service', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, StorageModule],
      providers: [StorageConsumer],
    }).compile();

    const consumer = moduleRef.get(StorageConsumer);

    expect(consumer.storage).toBeInstanceOf(StorageService);
    expect(consumer.storage).toBe(moduleRef.get(StorageService));
  });

  it('exports StorageService backed by the unconfigured adapter', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, StorageModule],
    }).compile();

    const service = moduleRef.get(StorageService);
    await expect(
      service.store({
        key: 'credentials/nurse/credential',
        body: Buffer.from('bytes'),
        contentType: 'application/pdf',
        contentDisposition: 'attachment',
      }),
    ).rejects.toBeInstanceOf(StorageNotConfiguredError);
  });

  it('builds StorageService against the configured S3 adapter', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, StorageModule],
    })
      .overrideProvider(APP_CONFIG)
      .useValue(
        loadConfig({
          S3_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
          S3_BUCKET: 'shiftpatch',
          S3_ACCESS_KEY_ID: 'access',
          S3_SECRET_ACCESS_KEY: 'secret',
        }),
      )
      .compile();

    expect(moduleRef.get(StorageService)).toBeInstanceOf(StorageService);
  });
});
