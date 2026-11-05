import type { AnalyticsClient } from '../types/analytics.js';

export class NoopAnalyticsClient implements AnalyticsClient {
  async capture(): Promise<void> {
    // Analytics is disabled locally and in any environment without a key.
  }
}
