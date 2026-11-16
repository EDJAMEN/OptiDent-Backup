/**
 * OptiDent Framework-Free RESTful API Entrypoint
 * 
 * =========================================================================
 * ARCHITECTURAL REQUIREMENTS INDEX (QUICK SEARCH TAGS):
 * - [REQ-1: PURE JSON BACKEND] -> See utils/httpHelper.js (sendSuccess / sendError)
 * - [REQ-2: STRICT SEPARATION OF CONCERNS / ANDROID READINESS] -> See server.js (Port 3001 standalone API)
 * - [REQ-3: CODE SEGREGATION - MVC & CONTROLLERS] -> See controllers/ & route dispatchers
 * - [REQ-4: RESTFUL NAMING - PLURAL NOUNS & HTTP METHODS] -> See server.js resource blocks
 * - [REQ-5: RETURN ACTUAL RESOURCE OBJECTS & ARRAYS WITH HATEOAS] -> See controllers/ & httpHelper.js
 * - [REQ-6: KEBAB-CASE URLS & API VERSIONING] -> See server.js pathname checks
 * - [REQ-7: STATELESS AUTHENTICATION - JWT TOKENS] -> See server.js Bearer token verification
 * =========================================================================
 */

import http from 'http';
import { URL } from 'url';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { initDatabase } from './utils/database.js';
import {
  sendError,
  sendSuccess,
  verifyStatelessToken
} from './utils/httpHelper.js';

// =========================================================================
// [REQ-3: CODE SEGREGATION - MVC & CONTROLLERS]
// Dedicated modular controllers imported. Zero business logic inside server.js.
// =========================================================================
import { authController } from './controllers/authController.js';
import { usersController } from './controllers/usersController.js';
import { appointmentsController } from './controllers/appointmentsController.js';
import { servicesController } from './controllers/servicesController.js';
import { clinicalRecordsController } from './controllers/clinicalRecordsController.js';
import { auditLogsController } from './controllers/auditLogsController.js';
import { recoveryVaultController } from './controllers/recoveryVaultController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =========================================================================
// [REQ-2: STRICT SEPARATION OF CONCERNS / ANDROID READINESS]
// Standalone API server running independently on Port 3001.
// Ready for Android (Retrofit / OkHttp) mobile app consumption.
// =========================================================================
const PORT = process.env.FRAMEWORK_FREE_PORT || 3001;
const REQUEST_TIMEOUT_MS = 10000; // 10 seconds strict timeout

// Initialize database connection pool
await initDatabase();

const server = http.createServer((req, res) => {
  const startTime = Date.now();
  let isHandled = false;

  // Enforce 10-second request timeout
  req.setTimeout(REQUEST_TIMEOUT_MS, () => {
    if (!res.headersSent) {
      isHandled = true;
      sendError(
        res,
        408,
        'REQUEST_TIMEOUT',
        'The server socket timed out waiting for the request to complete within 10000ms.',
        'Ensure payload transmission is fast and check your network latency.'
      );
    }
  });

  // Latency & Activity Logging on Response Finish
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.url} -> ${res.statusCode} (${duration}ms)`);
  });

  // =========================================================================
  // [REQ-2: STRICT SEPARATION OF CONCERNS / ANDROID READINESS]
  // Pre-configured CORS allowing cross-origin requests from web or Android clients
  // =========================================================================
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, Accept');

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Cache-Control': 'no-store' });
    return res.end();
  }

  // Parse URL & Query Parameters
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const queryParams = Object.fromEntries(parsedUrl.searchParams.entries());

  // =========================================================================
  // [REQ-6: KEBAB-CASE URLS & API VERSIONING]
  // Actively reject any URL containing underscores (_) with 400 Bad Request.
  // =========================================================================
  if (pathname.includes('_')) {
    return sendError(
      res,
      400,
      'INVALID_URI_FORMAT',
      `The requested URI "${pathname}" contains underscores (_), which violates RESTful kebab-case naming conventions.`,
      'Refactor URL to use kebab-case hyphens (-) and plural resource nouns (e.g., /api/v1/clinical-records).'
    );
  }

  // Health Check & OpenAPI Documentation endpoints
  if (pathname === '/api/v1/health' && req.method === 'GET') {
    return sendSuccess(res, 200, {
      status: 'UP',
      architecture: 'Pure Framework-Free Native Node.js RESTful API',
      version: 'v1.0.0',
      timestamp: new Date().toISOString()
    }, {
      openapi: { href: '/openapi.yaml', method: 'GET' }
    }, true);
  }

  if (pathname === '/openapi.yaml' || pathname === '/api/v1/openapi.yaml') {
    try {
      const openapiPath = path.resolve(__dirname, 'openapi.yaml');
      if (fs.existsSync(openapiPath)) {
        const content = fs.readFileSync(openapiPath, 'utf8');
        res.writeHead(200, {
          'Content-Type': 'application/yaml; charset=utf-8',
          'Cache-Control': 'public, max-age=300'
        });
        return res.end(content);
      }
    } catch (e) {}
  }

  // =========================================================================
  // [REQ-6: KEBAB-CASE URLS & API VERSIONING]
  // All endpoints must be version-prefixed with /api/v1/.
  // =========================================================================
  if (!pathname.startsWith('/api/v1/')) {
    return sendError(
      res,
      404,
      'INVALID_API_VERSION_OR_ROUTE',
      `Route "${pathname}" is not recognized. All endpoints must be version-prefixed with /api/v1/.`,
      'Prepend /api/v1/ to your request path.'
    );
  }

  // Strip prefix to extract resource path segments: /api/v1/{segments}
  const relPath = pathname.slice('/api/v1/'.length);
  const segments = relPath.split('/').filter(Boolean);
  const rootResource = segments[0]; // e.g. 'users', 'appointments', 'auth', etc.
  const resourceId = segments[1];   // e.g. ':id' or sub-resource
  const subAction = segments[2];    // e.g. 'restorations'

  // =========================================================================
  // [REQ-7: STATELESS AUTHENTICATION - JWT TOKENS]
  // Stateless Bearer token verification on all protected endpoints.
  // Zero server-side session memory or cookies used.
  // =========================================================================
  const isPublicRoute = (
    (rootResource === 'auth' && (resourceId === 'tokens' || resourceId === 'registrations')) ||
    rootResource === 'health'
  );

  let authenticatedUser = null;
  if (!isPublicRoute) {
    const authHeader = req.headers['authorization'];
    const apiKeyHeader = req.headers['x-api-key'];

    if (!authHeader && !apiKeyHeader) {
      return sendError(
        res,
        401,
        'MISSING_AUTHENTICATION_CREDENTIALS',
        'Every incoming request must be authenticated independently via standard headers.',
        'Include a valid Bearer token in the "Authorization: Bearer <token>" header or an "X-API-Key" header.'
      );
    }

    let token = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else if (apiKeyHeader) {
      token = apiKeyHeader.trim();
    }

    authenticatedUser = verifyStatelessToken(token);
    if (!authenticatedUser) {
      return sendError(
        res,
        401,
        'INVALID_OR_EXPIRED_TOKEN',
        'The provided Bearer token is either invalid, tampered with, or expired.',
        'Request a new token by authenticating at POST /api/v1/auth/tokens.'
      );
    }
  }

  // =========================================================================
  // [REQ-4: RESTFUL NAMING - PLURAL NOUNS & HTTP METHODS]
  // Zero verbs in URLs. Dispatching strictly via HTTP methods (GET, POST, PUT, PATCH, DELETE).
  // =========================================================================
  try {
    // AUTH DOMAIN: /api/v1/auth/*
    if (rootResource === 'auth') {
      if (resourceId === 'tokens') {
        if (req.method === 'POST') return authController.createToken(req, res);
        return sendError(res, 405, 'METHOD_NOT_ALLOWED', `Method ${req.method} not allowed on /api/v1/auth/tokens.`, 'Use POST.');
      }
      if (resourceId === 'registrations') {
        if (req.method === 'POST') return authController.registerPatient(req, res);
        return sendError(res, 405, 'METHOD_NOT_ALLOWED', `Method ${req.method} not allowed on /api/v1/auth/registrations.`, 'Use POST.');
      }
      return sendError(res, 404, 'AUTH_RESOURCE_NOT_FOUND', `Unknown auth endpoint: /api/v1/auth/${resourceId || ''}`, 'Verify auth route.');
    }

    // USERS RESOURCE: /api/v1/users [/:id]
    if (rootResource === 'users') {
      if (!resourceId) {
        if (req.method === 'GET') return usersController.listUsers(req, res, queryParams);
        if (req.method === 'POST') return usersController.createUser(req, res);
        return sendError(res, 405, 'METHOD_NOT_ALLOWED', `Method ${req.method} not allowed on /api/v1/users.`, 'Use GET or POST.');
      } else {
        if (req.method === 'GET') return usersController.getUserById(req, res, resourceId);
        if (req.method === 'PUT') return usersController.replaceUser(req, res, resourceId);
        if (req.method === 'PATCH') return usersController.patchUser(req, res, resourceId);
        if (req.method === 'DELETE') return usersController.deleteUser(req, res, resourceId);
        return sendError(res, 405, 'METHOD_NOT_ALLOWED', `Method ${req.method} not allowed on /api/v1/users/:id.`, 'Use GET, PUT, PATCH, or DELETE.');
      }
    }

    // APPOINTMENTS RESOURCE: /api/v1/appointments [/:id]
    if (rootResource === 'appointments') {
      if (!resourceId) {
        if (req.method === 'GET') return appointmentsController.listAppointments(req, res, queryParams);
        if (req.method === 'POST') return appointmentsController.createAppointment(req, res, authenticatedUser);
        return sendError(res, 405, 'METHOD_NOT_ALLOWED', `Method ${req.method} not allowed on /api/v1/appointments.`, 'Use GET or POST.');
      } else {
        if (req.method === 'GET') return appointmentsController.getAppointmentById(req, res, resourceId);
        if (req.method === 'PUT') return appointmentsController.replaceAppointment(req, res, resourceId);
        if (req.method === 'PATCH') return appointmentsController.patchAppointment(req, res, resourceId);
        if (req.method === 'DELETE') return appointmentsController.deleteAppointment(req, res, resourceId);
        return sendError(res, 405, 'METHOD_NOT_ALLOWED', `Method ${req.method} not allowed on /api/v1/appointments/:id.`, 'Use GET, PUT, PATCH, or DELETE.');
      }
    }

    // SERVICES RESOURCE: /api/v1/services [/:id]
    if (rootResource === 'services') {
      if (!resourceId) {
        if (req.method === 'GET') return servicesController.listServices(req, res, queryParams);
        if (req.method === 'POST') return servicesController.createService(req, res);
        return sendError(res, 405, 'METHOD_NOT_ALLOWED', `Method ${req.method} not allowed on /api/v1/services.`, 'Use GET or POST.');
      } else {
        if (req.method === 'GET') return servicesController.getServiceById(req, res, resourceId);
        if (req.method === 'PUT') return servicesController.replaceService(req, res, resourceId);
        if (req.method === 'PATCH') return servicesController.patchService(req, res, resourceId);
        if (req.method === 'DELETE') return servicesController.deleteService(req, res, resourceId);
        return sendError(res, 405, 'METHOD_NOT_ALLOWED', `Method ${req.method} not allowed on /api/v1/services/:id.`, 'Use GET, PUT, PATCH, or DELETE.');
      }
    }

    // CLINICAL RECORDS RESOURCE: /api/v1/clinical-records [/:id]
    if (rootResource === 'clinical-records') {
      if (!resourceId) {
        if (req.method === 'GET') return clinicalRecordsController.listRecords(req, res, queryParams);
        if (req.method === 'POST') return clinicalRecordsController.createRecord(req, res, authenticatedUser);
        return sendError(res, 405, 'METHOD_NOT_ALLOWED', `Method ${req.method} not allowed on /api/v1/clinical-records.`, 'Use GET or POST.');
      } else {
        if (req.method === 'GET') return clinicalRecordsController.getRecordById(req, res, resourceId);
        if (req.method === 'PUT') return clinicalRecordsController.replaceRecord(req, res, resourceId);
        if (req.method === 'PATCH') return clinicalRecordsController.patchRecord(req, res, resourceId);
        if (req.method === 'DELETE') return clinicalRecordsController.deleteRecord(req, res, resourceId);
        return sendError(res, 405, 'METHOD_NOT_ALLOWED', `Method ${req.method} not allowed on /api/v1/clinical-records/:id.`, 'Use GET, PUT, PATCH, or DELETE.');
      }
    }

    // AUDIT LOGS RESOURCE: /api/v1/audit-logs [/:id]
    if (rootResource === 'audit-logs') {
      if (!resourceId) {
        if (req.method === 'GET') return auditLogsController.listLogs(req, res, queryParams);
        if (req.method === 'POST') return auditLogsController.createLog(req, res, authenticatedUser);
        return sendError(res, 405, 'METHOD_NOT_ALLOWED', `Method ${req.method} not allowed on /api/v1/audit-logs.`, 'Use GET or POST.');
      } else {
        if (req.method === 'GET') return auditLogsController.getLogById(req, res, resourceId);
        return sendError(res, 405, 'METHOD_NOT_ALLOWED', `Method ${req.method} not allowed on /api/v1/audit-logs/:id.`, 'Use GET.');
      }
    }

    // RECOVERY VAULT RESOURCE: /api/v1/recovery-vault [/:id[/restorations]]
    if (rootResource === 'recovery-vault') {
      if (!resourceId) {
        if (req.method === 'GET') return recoveryVaultController.listVaultRecords(req, res, queryParams);
        return sendError(res, 405, 'METHOD_NOT_ALLOWED', `Method ${req.method} not allowed on /api/v1/recovery-vault.`, 'Use GET.');
      } else if (subAction === 'restorations') {
        if (req.method === 'POST') return recoveryVaultController.restoreRecord(req, res, resourceId, queryParams);
        return sendError(res, 405, 'METHOD_NOT_ALLOWED', `Method ${req.method} not allowed on restoration.`, 'Use POST.');
      } else {
        if (req.method === 'DELETE') return recoveryVaultController.purgeRecord(req, res, resourceId, queryParams);
        return sendError(res, 405, 'METHOD_NOT_ALLOWED', `Method ${req.method} not allowed on /api/v1/recovery-vault/:id.`, 'Use DELETE or POST /:id/restorations.');
      }
    }

    // Unmatched Resource URI
    return sendError(
      res,
      404,
      'UNKNOWN_RESOURCE',
      `Resource "/api/v1/${rootResource}" does not exist in this REST API.`,
      'Refer to /openapi.yaml for the catalog of supported plural resources.'
    );
  } catch (err) {
    sendError(
      res,
      500,
      'UNHANDLED_ROUTING_EXCEPTION',
      err.message || 'An unexpected server exception interrupted request dispatching.',
      'Check server error output.'
    );
  }
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 OptiDent Framework-Free RESTful API running on: http://localhost:${PORT}`);
  console.log(`📡 Architecture: Pure Native Node.js (http, url, crypto)`);
  console.log(`📋 OpenAPI Spec: http://localhost:${PORT}/openapi.yaml`);
  console.log(`🛡️  Constraints: Stateless Bearer Auth • HATEOAS • 10s Timeouts`);
  console.log(`====================================================`);
});


