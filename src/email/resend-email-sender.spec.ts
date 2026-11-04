import { NoopEmailSender } from './email-sender.js';
import {
  EmailDeliveryError,
  ResendEmailSender,
} from './resend-email-sender.js';

describe('NoopEmailSender', () => {
  it('accepts a message without delivering it', async () => {
    await expect(
      new NoopEmailSender().send({
        to: 'nurse@example.test',
        subject: 'Verify your email',
        text: 'token=secret',
      }),
    ).resolves.toEqual({ delivered: false });
  });
});

describe('ResendEmailSender', () => {
  const sender = new ResendEmailSender(
    're_test',
    'no-reply@example.test',
    'support@example.test',
  );

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the message without logging it', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'email-1' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      sender.send({
        to: 'nurse@example.test',
        subject: 'Verify your email',
        text: 'token=secret',
        html: '<p>token=secret</p>',
      }),
    ).resolves.toEqual({ delivered: true, id: 'email-1' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer re_test',
          'Content-Type': 'application/json',
        },
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body).toMatchObject({
      from: 'no-reply@example.test',
      to: ['nurse@example.test'],
      subject: 'Verify your email',
      reply_to: 'support@example.test',
      html: '<p>token=secret</p>',
    });
  });

  it('omits optional html and reply-to when absent', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    await new ResendEmailSender('re_test', 'no-reply@example.test').send({
      to: 'nurse@example.test',
      subject: 'Subject',
      text: 'Text',
    });

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body).not.toHaveProperty('html');
    expect(body).not.toHaveProperty('reply_to');
  });

  it('turns a provider rejection into a status-only error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 422 }),
    );

    await expect(
      sender.send({
        to: 'nurse@example.test',
        subject: 'Subject',
        text: 'Text',
      }),
    ).rejects.toThrow(new EmailDeliveryError(422));
  });
});
