import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

export interface ReadinessResult {
  ready: boolean;
  checks: {
    database: 'up' | 'down';
  };
}

@Injectable()
export class HealthService {
  constructor(private readonly database: DatabaseService) {}

  async readiness(): Promise<ReadinessResult> {
    const databaseIsUp = await this.database.ping();
    return {
      ready: databaseIsUp,
      checks: { database: databaseIsUp ? 'up' : 'down' },
    };
  }
}
