import { RequestContextService } from './request-context.service.js';

describe('RequestContextService', () => {
  const service = new RequestContextService();

  it('has no context outside a request', () => {
    expect(service.get()).toBeUndefined();
    expect(service.getRequestId()).toBeUndefined();
    expect(service.getUser()).toBeUndefined();
  });

  it('exposes the request id inside the callback', () => {
    const seen = service.run({ requestId: 'trace-12345678' }, () => ({
      id: service.getRequestId(),
      context: service.get(),
    }));

    expect(seen.id).toBe('trace-12345678');
    expect(seen.context?.requestId).toBe('trace-12345678');
    expect(service.get()).toBeUndefined();
  });

  it('lets an auth guard attach the authenticated user', () => {
    const user = service.run({ requestId: 'trace-12345678' }, () => {
      service.setUser({ id: 'user-1', role: 'NURSE' });
      return service.getUser();
    });

    expect(user).toEqual({ id: 'user-1', role: 'NURSE' });
  });

  it('refuses to attach a user outside a request', () => {
    expect(() => service.setUser({ id: 'user-1', role: 'NURSE' })).toThrow(
      'Cannot set an authenticated user outside a request',
    );
  });
});
