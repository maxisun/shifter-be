import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { OBJECT_STORAGE, UnconfiguredObjectStorage } from './object-storage.js';
import { createObjectStorage } from './s3-object-storage.js';

@Global()
@Module({
  providers: [
    {
      provide: OBJECT_STORAGE,
      useFactory: (config: AppConfig) =>
        config.storage
          ? createObjectStorage(config.storage)
          : new UnconfiguredObjectStorage(),
      inject: [APP_CONFIG],
    },
  ],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
