import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  APP_CONFIG,
  type AppConfig,
  loadConfig,
  shouldIgnoreEnvFile,
} from './config.js';

const appConfigProvider = {
  provide: APP_CONFIG,
  inject: [ConfigService],
  useFactory: (configService: ConfigService): AppConfig => {
    const value = configService.get<AppConfig>('appConfig');
    if (!value) {
      throw new Error('Validated application config is not available');
    }
    return value;
  },
};

/**
 * Loads `.env.local` then `.env` for local development and validates every
 * value before any module can read it. Environment values that already exist
 * win over file values, matching Nest's default dotenv behaviour.
 */
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Production and tests ignore files; local development loads them.
      ignoreEnvFile: shouldIgnoreEnvFile(),
      envFilePath: ['.env.local', '.env'],
      validate: (environment) => ({
        appConfig: loadConfig(environment as NodeJS.ProcessEnv),
      }),
    }),
  ],
  providers: [appConfigProvider],
  exports: [appConfigProvider],
})
export class AppConfigModule {}
