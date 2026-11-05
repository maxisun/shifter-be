import type { Logger } from 'pino';
import type { PostHogConfig } from '../../config/config.js';
import type { AnalyticsClient, AnalyticsEvent } from '../types/analytics.js';

/**
 * PostHog's capture endpoint is enough for the MVP's bounded event list. The
 * call is best-effort: a timeout or rejection is logged by event name only and
 * never propagates into a committed workflow.
 */
export class PostHogAnalyticsClient implements AnalyticsClient {
  constructor(
    private readonly config: PostHogConfig,
    private readonly environment: string,
    private readonly logger: Logger,
  ) {}

  async capture(event: AnalyticsEvent): Promise<void> {
    try {
      const response = await fetch(
        `${this.config.host.replace(/\/$/, '')}/capture/`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: this.config.apiKey,
            event: event.name,
            distinct_id: event.distinctId,
            timestamp: new Date().toISOString(),
            properties: {
              ...event.properties,
              environment: this.environment,
              ...(event.role ? { role: event.role } : {}),
            },
          }),
          signal: AbortSignal.timeout(5_000),
        },
      );
      if (!response.ok) {
        this.logger.warn(
          { event: event.name, status: response.status },
          'Analytics event was not accepted',
        );
      }
    } catch {
      this.logger.warn(
        { event: event.name },
        'Analytics event could not be delivered',
      );
    }
  }
}
