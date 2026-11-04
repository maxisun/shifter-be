import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { EMAIL_SENDER, NoopEmailSender } from './email-sender.js';
import { ResendEmailSender } from './resend-email-sender.js';

@Global()
@Module({
  providers: [
    {
      provide: EMAIL_SENDER,
      useFactory: (config: AppConfig) =>
        config.email
          ? new ResendEmailSender(
              config.email.apiKey,
              config.email.from,
              config.email.replyTo,
            )
          : new NoopEmailSender(),
      inject: [APP_CONFIG],
    },
  ],
  exports: [EMAIL_SENDER],
})
export class EmailModule {}
