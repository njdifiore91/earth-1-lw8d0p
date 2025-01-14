// jest v29.5.0
import { describe, beforeAll, afterAll, beforeEach, afterEach, it, expect } from '@jest/globals';
// supertest v6.3.3
import request from 'supertest';
// nock v13.3.0
import nock from 'nock';
// jsonwebtoken v9.0.0
import jwt from 'jsonwebtoken';
// express v4.18.2
import { Express } from 'express';

import app from '../src/app';
import { gatewayConfig } from '../src/config/gateway.config';
import { ApiError, ERROR_CODES } from '../src/utils/error.utils';

describe('API Gateway Integration Tests', () => {
  let server: Express;
  let validToken: string;
  let expiredToken: string;
  let adminToken: string;

  // Mock service endpoints
  const authServiceMock = nock(gatewayConfig.services.auth.url);
  const searchServiceMock = nock(gatewayConfig.services.search.url);
  const planningServiceMock = nock(gatewayConfig.services.planning.url);

  beforeAll(async () => {
    // Configure test environment
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-secret-key';

    // Generate test tokens
    validToken = jwt.sign(
      {
        id: 'test-user-id',
        email: 'test@example.com',
        role: 'user',
        permissions: ['search:basic', 'plan:view'],
        iss: 'matter-platform',
        aud: 'matter-api'
      },
      process.env.JWT_SECRET,
      { algorithm: 'RS256', expiresIn: '1h' }
    );

    adminToken = jwt.sign(
      {
        id: 'admin-id',
        email: 'admin@example.com',
        role: 'admin',
        permissions: ['system:admin', 'metrics:view'],
        iss: 'matter-platform',
        aud: 'matter-api'
      },
      process.env.JWT_SECRET,
      { algorithm: 'RS256', expiresIn: '1h' }
    );

    expiredToken = jwt.sign(
      {
        id: 'expired-user-id',
        email: 'expired@example.com',
        role: 'user'
      },
      process.env.JWT_SECRET,
      { algorithm: 'RS256', expiresIn: '-1h' }
    );

    server = app;
  });

  afterAll(async () => {
    nock.cleanAll();
    process.env.NODE_ENV = 'development';
    delete process.env.JWT_SECRET;
  });

  beforeEach(() => {
    nock.cleanAll();
  });

  describe('Authentication Tests', () => {
    it('should accept valid JWT tokens', async () => {
      const response = await request(server)
        .get('/api/v1/search')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.headers['x-request-id']).toBeDefined();
    });

    it('should reject invalid JWT signatures', async () => {
      const invalidToken = validToken.slice(0, -5) + 'wrong';
      const response = await request(server)
        .get('/api/v1/search')
        .set('Authorization', `Bearer ${invalidToken}`);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe(ERROR_CODES.AUTHENTICATION_ERROR);
    });

    it('should handle expired tokens', async () => {
      const response = await request(server)
        .get('/api/v1/search')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
      expect(response.body.error.message).toContain('expired');
    });

    it('should enforce rate limits', async () => {
      const requests = Array(101).fill(null).map(() => 
        request(server)
          .get('/api/v1/search')
          .set('Authorization', `Bearer ${validToken}`)
      );

      const responses = await Promise.all(requests);
      const tooManyRequests = responses.filter(r => r.status === 429);
      expect(tooManyRequests.length).toBeGreaterThan(0);
    });
  });

  describe('Route Proxying Tests', () => {
    it('should proxy auth service requests', async () => {
      authServiceMock
        .post('/login')
        .reply(200, { token: 'test-token' });

      const response = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'test@example.com', password: 'password' });

      expect(response.status).toBe(200);
      expect(response.body.token).toBe('test-token');
    });

    it('should proxy search service with query parameters', async () => {
      searchServiceMock
        .get('/search?location=test&type=satellite')
        .reply(200, { results: [] });

      const response = await request(server)
        .get('/api/v1/search/search?location=test&type=satellite')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.results).toBeDefined();
    });

    it('should handle service timeouts', async () => {
      planningServiceMock
        .post('/plans')
        .delay(gatewayConfig.services.planning.timeout + 1000)
        .reply(200);

      const response = await request(server)
        .post('/api/v1/planning/plans')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ planData: 'test' });

      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe(ERROR_CODES.SYSTEM_ERROR);
    });

    it('should implement circuit breaker', async () => {
      // Generate 5 failed requests to trigger circuit breaker
      planningServiceMock
        .post('/plans')
        .times(5)
        .reply(500);

      const requests = Array(5).fill(null).map(() =>
        request(server)
          .post('/api/v1/planning/plans')
          .set('Authorization', `Bearer ${validToken}`)
          .send({ planData: 'test' })
      );

      await Promise.all(requests);

      // Next request should be rejected by circuit breaker
      const response = await request(server)
        .post('/api/v1/planning/plans')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ planData: 'test' });

      expect(response.status).toBe(503);
      expect(response.body.error.message).toContain('Service unavailable');
    });
  });

  describe('Security Tests', () => {
    it('should enforce CORS policies', async () => {
      const response = await request(server)
        .get('/api/v1/search')
        .set('Origin', 'http://malicious-site.com')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(403);
    });

    it('should set security headers', async () => {
      const response = await request(server)
        .get('/api/v1/search')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.headers['strict-transport-security']).toBeDefined();
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
    });

    it('should validate admin role authorization', async () => {
      const response = await request(server)
        .get('/api/v1/admin/metrics')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
    });

    it('should reject unauthorized admin access', async () => {
      const response = await request(server)
        .get('/api/v1/admin/metrics')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe(ERROR_CODES.AUTHORIZATION_ERROR);
    });
  });

  describe('Error Handling Tests', () => {
    it('should handle 404 errors', async () => {
      const response = await request(server)
        .get('/api/v1/nonexistent')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe(ERROR_CODES.SYSTEM_ERROR);
    });

    it('should handle validation errors', async () => {
      const response = await request(server)
        .post('/api/v1/planning/plans')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ invalidData: true });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    });

    it('should sanitize error responses', async () => {
      const response = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'test@example.com', password: 'password' });

      expect(response.body.error?.stack).toBeUndefined();
      expect(response.body.error?.details?.password).toBeUndefined();
    });
  });
});