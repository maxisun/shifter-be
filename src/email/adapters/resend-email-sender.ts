import type {
  EmailMessage,
  EmailSender,
  EmailSendResult,
} from '../types/email.js';

export class EmailDeliveryError extends Error {
  constructor(readonly status: number) {
    super(`Email provider rejected the message with HTTP ${status}`);
    this.name = 'EmailDeliveryError';
  }
}

interface ResendResponse {
  id?: string;
}

/**
 * Resend is the transactional provider. The adapter does not log the
 * recipient, subject or body, so a delivery failure cannot leak an email
 * address or a verification link into technical logs.
 */
export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly replyTo?: string,
  ) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
        ...(this.replyTo ? { reply_to: this.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new EmailDeliveryError(response.status);
    }

    const body = (await response.json()) as ResendResponse;
    return { delivered: true, id: body.id };
  }
}
