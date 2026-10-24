import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { testApp } from '../test/app';

describe('GET /api/health', () => {
  it('answers ok', async () => {
    const res = await request(testApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('API docs', () => {
  it('serves an OpenAPI 3.1 document generated from Zod', async () => {
    const res = await request(testApp()).get('/api/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(res.body.paths['/api/health'].get.responses['200']).toBeDefined();
    expect(res.body.components.schemas).toHaveProperty('Error');
  });

  it('serves Swagger UI at /api/docs from this server', async () => {
    const res = await request(testApp()).get('/api/docs/').redirects(1);
    expect(res.status).toBe(200);
    expect(res.text).toContain('swagger-ui');
    expect(res.text).not.toMatch(/https?:\/\/(cdn|unpkg|cdnjs)/);
  });
});
