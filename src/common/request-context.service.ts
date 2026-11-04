import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import type { components } from '../generated/api/schema.js';

export type Role = components['schemas']['Role'];

export interface AuthenticatedUser {
  id: string;
  role: Role;
}

export interface RequestContext {
  requestId: string;
  user?: AuthenticatedUser;
}

/**
 * Request-scoped state that every layer can read without threading it through
 * call signatures. Authentication populates `user`; today only the request id
 * is guaranteed.
 */
@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  run<T>(context: RequestContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  get(): RequestContext | undefined {
    return this.storage.getStore();
  }

  getRequestId(): string | undefined {
    return this.storage.getStore()?.requestId;
  }

  getUser(): AuthenticatedUser | undefined {
    return this.storage.getStore()?.user;
  }

  setUser(user: AuthenticatedUser): void {
    const context = this.storage.getStore();
    if (!context) {
      throw new Error('Cannot set an authenticated user outside a request');
    }
    context.user = user;
  }
}
