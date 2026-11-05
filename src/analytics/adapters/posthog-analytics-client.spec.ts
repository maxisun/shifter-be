import type { Logger } from 'pino';
import { NoopAnalyticsClient } from './noop-analytics-client.js';
import { PostHogAnalyticsClient } from './posthog-analytics-client.js';

function logger() {
  return { warn: vi.fn() } as unknown as Logger;
}

describe('NoopAnalyticsClient', () => {
  it('accepts events without sending them', async () => {
    await expect(
      new NoopAnalyticsClient().capture({
        name: 'shift_claimed',
        distinctId: 'user-1',
      }),
    ).resolves.toBeUndefined();
  });
});

describe('PostHogAnalyticsClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the bounded event with environment and role', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const client = new PostHogAnalyticsClient(
      { apiKey: 'phc_test', host: 'https://us.i.posthog.com/' },
      'test',
      logger(),
    );

    await client.capture({
      name: 'shift_claimed',
      distinctId: 'user-1',
      role: 'NURSE',
      properties: { shift_id: 'shift-1', facility_id: 'facility-1' },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://us.i.posthog.com/capture/',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body).toMatchObject({
      api_key: 'phc_test',
      event: 'shift_claimed',
      distinct_id: 'user-1',
      properties: {
        shift_id: 'shift-1',
        facility_id: 'facility-1',
        environment: 'test',
        role: 'NURSE',
      },
    });
  });

  it('logs only the event name when PostHog rejects the event', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    );
    const log = logger();
    const client = new PostHogAnalyticsClient(
      { apiKey: 'phc_test', host: 'https://us.i.posthog.com' },
      'test',
      log,
    );

    await expect(
      client.capture({
        name: 'shift_claimed',
        distinctId: 'user-1',
        properties: { shift_id: 'shift-1' },
      }),
    ).resolves.toBeUndefined();

    expect(log.warn).toHaveBeenCalledWith(
      { event: 'shift_claimed', status: 503 },
      'Analytics event was not accepted',
    );
  });

  it('swallows network failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network down')),
    );
    const log = logger();
    const client = new PostHogAnalyticsClient(
      { apiKey: 'phc_test', host: 'https://us.i.posthog.com' },
      'test',
      log,
    );

    await expect(
      client.capture({ name: 'email_verified', distinctId: 'user-1' }),
    ).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith(
      { event: 'email_verified' },
      'Analytics event could not be delivered',
    );
  });
});
