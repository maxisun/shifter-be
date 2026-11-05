import { Inject, Injectable } from '@nestjs/common';
import { ANALYTICS_CLIENT } from '../analytics-client.js';
import type { AnalyticsClient, AnalyticsEvent } from '../types/analytics.js';

/** The analytics module's public surface; feature code injects this, never the port. */
@Injectable()
export class AnalyticsService {
  constructor(
    @Inject(ANALYTICS_CLIENT) private readonly client: AnalyticsClient,
  ) {}

  async capture(event: AnalyticsEvent): Promise<void> {
    await this.client.capture(event);
  }
}
