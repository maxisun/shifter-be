import type { Role } from '../../common/request-context.service.js';

export interface AnalyticsEvent {
  name: string;
  distinctId: string;
  role?: Role;
  properties?: Record<string, string | number | boolean>;
}

export interface AnalyticsClient {
  capture(event: AnalyticsEvent): Promise<void>;
}
