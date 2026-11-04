export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailSendResult {
  delivered: boolean;
  id?: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<EmailSendResult>;
}

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

/**
 * Local development and tests have no email provider. Returning a result
 * instead of throwing keeps workflows runnable without credentials.
 */
export class NoopEmailSender implements EmailSender {
  async send(): Promise<EmailSendResult> {
    return { delivered: false };
  }
}
