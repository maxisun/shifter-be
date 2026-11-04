import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { createS3ObjectStorage } from './adapters/s3-object-storage.js';
import { UnconfiguredObjectStorage } from './adapters/unconfigured-object-storage.js';
import { OBJECT_STORAGE } from './object-storage.js';
import { StorageService } from './services/storage.service.js';

@Module({
  providers: [
    {
      provide: OBJECT_STORAGE,
      useFactory: (config: AppConfig) =>
        config.storage
          ? createS3ObjectStorage(config.storage)
          : new UnconfiguredObjectStorage(),
      inject: [APP_CONFIG],
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
