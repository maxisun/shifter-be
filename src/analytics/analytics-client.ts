import type { Role } from '../common/request-context.service.js';

export interface AnalyticsEvent {
  name: string;
  distinctId: string;
  role?: Role;
  properties?: Record<string, string | number | boolean>;
}

export interface AnalyticsClient {
  capture(event: AnalyticsEvent): Promise<void>;
}

export const ANALYTICS_CLIENT = Symbol('ANALYTICS_CLIENT');

export class NoopAnalyticsClient implements AnalyticsClient {
  async capture(): Promise<void> {
    // Analytics is disabled locally and in any environment without a key.
  }
}
