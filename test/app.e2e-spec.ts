import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createTestApp } from './support/test-app.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    app = await createTestApp();
  });

  it('/ (GET) keeps the walking-skeleton greeting', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/ (HEAD) returns representation headers and no body', async () => {
    const response = await request(app.getHttpServer()).head('/').expect(200);
    expect(response.text ?? '').toBe('');
    expect(response.headers['content-length']).toBe('12');
  });

  afterEach(async () => {
    await app.close();
  });
});
