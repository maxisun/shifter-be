import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { ProbeController } from './support/probe.controller.js';
import { createTestApp } from './support/test-app.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const ERROR_KEYS = ['code', 'issues', 'message', 'requestId'];

describe('request context and contract errors (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    app = await createTestApp([ProbeController]);
  });

  afterEach(async () => {
    await app.close();
  });

  it('echoes a valid request id and puts it in the error envelope', async () => {
    const response = await request(app.getHttpServer())
      .get('/nope')
      .set('x-request-id', 'trace-12345678')
      .expect(404);

    expect(response.headers['x-request-id']).toBe('trace-12345678');
    expect(response.body).toEqual({
      code: 'RESOURCE_NOT_FOUND',
      message: 'Cannot GET /nope',
      issues: [],
      requestId: 'trace-12345678',
    });
    expect(Object.keys(response.body).sort()).toEqual(ERROR_KEYS);
  });

  it('generates an id when the client sends none', async () => {
    const response = await request(app.getHttpServer()).get('/').expect(200);
    expect(response.headers['x-request-id']).toMatch(UUID_PATTERN);
  });

  it('replaces an unsafe client id', async () => {
    const response = await request(app.getHttpServer())
      .get('/')
      .set('x-request-id', 'bad id with spaces')
      .expect(200);

    expect(response.headers['x-request-id']).toMatch(UUID_PATTERN);
  });

  it('rejects a wrong method with the same envelope', async () => {
    const response = await request(app.getHttpServer())
      .post('/')
      .set('x-request-id', 'trace-12345678')
      .expect(404);

    expect(response.body).toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
      requestId: 'trace-12345678',
    });
    expect(response.body.message).toContain('Cannot POST /');
  });

  it('maps validation failures with field-level issues', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/probe/validation?age=abc&email=nope')
      .set('x-request-id', 'trace-12345678')
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      requestId: 'trace-12345678',
    });
    expect(response.body.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'age' }),
        expect.objectContaining({ path: 'email' }),
      ]),
    );
    expect(Object.keys(response.body).sort()).toEqual(ERROR_KEYS);
  });

  it.each([
    ['/api/v1/probe/unauthorized', 401, 'AUTHENTICATION_REQUIRED'],
    ['/api/v1/probe/forbidden', 403, 'ACCESS_DENIED'],
    ['/api/v1/probe/not-found', 404, 'RESOURCE_NOT_FOUND'],
    ['/api/v1/probe/conflict', 409, 'CONFLICT'],
  ])('maps %s to %i %s', async (path, status, code) => {
    const response = await request(app.getHttpServer())
      .get(path)
      .set('x-request-id', 'trace-12345678')
      .expect(status);

    expect(response.body).toMatchObject({
      code,
      issues: [],
      requestId: 'trace-12345678',
    });
    expect(Object.keys(response.body).sort()).toEqual(ERROR_KEYS);
  });

  it('does not leak an internal error message', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/probe/failure')
      .set('x-request-id', 'trace-12345678')
      .expect(500);

    expect(response.body).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      issues: [],
      requestId: 'trace-12345678',
    });
    expect(JSON.stringify(response.body)).not.toContain('hunter2');
  });

  it('serves liveness ahead of the API prefix', async () => {
    const response = await request(app.getHttpServer())
      .get('/health/live')
      .set('x-request-id', 'trace-12345678')
      .expect(200);

    expect(response.body).toEqual({
      status: 'ok',
      requestId: 'trace-12345678',
    });
  });

  it('mounts API routes under /api/v1 and keeps probes at the origin', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/probe/unauthorized')
      .expect(401);
    await request(app.getHttpServer()).get('/health/live').expect(200);
    await request(app.getHttpServer()).get('/api/v1/health/live').expect(404);
  });
});
