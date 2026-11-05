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
