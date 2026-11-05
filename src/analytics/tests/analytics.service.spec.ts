import { AnalyticsService } from '../services/analytics.service.js';
import type { AnalyticsClient } from '../types/analytics.js';

describe('AnalyticsService', () => {
  it('passes the event to the configured client', async () => {
    const client: AnalyticsClient = {
      capture: vi.fn().mockResolvedValue(undefined),
    };
    const service = new AnalyticsService(client);
    const event = {
      name: 'shift_claimed',
      distinctId: 'user-1',
      properties: { shift_id: 'shift-1' },
    };

    await service.capture(event);

    expect(client.capture).toHaveBeenCalledWith(event);
  });
});
