import type { EmailSender, EmailSendResult } from '../types/email.js';

/**
 * Local development and tests have no email provider. Returning a result
 * instead of throwing keeps workflows runnable without credentials.
 */
export class NoopEmailSender implements EmailSender {
  async send(): Promise<EmailSendResult> {
    return { delivered: false };
  }
}
