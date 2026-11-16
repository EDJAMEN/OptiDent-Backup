/**
 * OptiDent Framework-Free RESTful API
 * Centralized HTTP Utilities Module
 * 
 * =========================================================================
 * ARCHITECTURAL REQUIREMENTS INDEX (QUICK SEARCH TAGS):
 * - [REQ-1: PURE JSON BACKEND] -> parseJsonBody, sendSuccess, sendError
 * - [REQ-5: RETURN ACTUAL RESOURCE OBJECTS & ARRAYS WITH HATEOAS] -> buildResourceLinks, buildCollectionLinks
 * - [REQ-7: STATELESS AUTHENTICATION - JWT TOKENS] -> generateStatelessToken, verifyStatelessToken
 * =========================================================================
 * 
 * Enforces:
 * - Request payload size limits (1MB default -> 413 Payload Too Large)
 * - Standardized JSON success responses with HATEOAS _links
 * - Standardized JSON error schema
 * - Explicit Cache-Control headers (public, max-age=60 for GET; no-store for others)
 * - Cryptographically signed stateless Bearer tokens (HMAC-SHA256)
 */

import crypto from 'crypto';

const MAX_PAYLOAD_SIZE = 1024 * 1024; // 1MB Cap
const TOKEN_SECRET = process.env.JWT_SECRET || 'optident_stateless_secret_key_2026_super_secure';

// =========================================================================
// [REQ-1: PURE JSON BACKEND]
// Request body parser: reads incoming chunks, enforces 1MB cap, parses JSON safely.
// =========================================================================
export function parseJsonBody(req, maxBytes = MAX_PAYLOAD_SIZE) {

  return new Promise((resolve, reject) => {
    // If request already has no body (e.g., GET, DELETE, HEAD)
    if (['GET', 'HEAD', 'DELETE'].includes(req.method) && !req.headers['content-length']) {
      return resolve({});
    }

    let byteCount = 0;
    const chunks = [];

    req.on('data', (chunk) => {
      byteCount += chunk.length;
      if (byteCount > maxBytes) {
        req.destroy(); // Terminate socket to stop data flooding
        const err = new Error('Request payload exceeds maximum allowed size of 1MB.');
        err.code = 'PAYLOAD_TOO_LARGE';
        err.status = 413;
        err.action = 'Reduce the size of the request body before retrying.';
        return reject(err);
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (chunks.length === 0) {
        return resolve({});
      }
      const rawString = Buffer.concat(chunks).toString('utf8').trim();
      if (!rawString) {
        return resolve({});
      }

      try {
        const parsed = JSON.parse(rawString);
        resolve(parsed);
      } catch (jsonErr) {
        const err = new Error('Malformed JSON payload received: ' + jsonErr.message);
        err.code = 'MALFORMED_JSON_PAYLOAD';
        err.status = 400;
        err.action = 'Verify that the request body is valid JSON with properly quoted keys and values.';
        reject(err);
      }
    });

    req.on('error', (ioErr) => {
      const err = new Error('Network I/O error occurred while receiving request body.');
      err.code = 'PAYLOAD_READ_ERROR';
      err.status = 400;
      err.action = 'Check network stability and retry the HTTP request.';
      reject(err);
    });
  });
}

// =========================================================================
// [REQ-5: RETURN ACTUAL RESOURCE OBJECTS & ARRAYS WITH HATEOAS]
// Hypermedia Link Builders: Constructs standard HATEOAS controls (_links)
// containing 'self', 'collection', 'replace', 'partial-update', and 'delete'
// with explicit 'href' and 'method' properties.
// =========================================================================
export function buildResourceLinks(resourceBaseUri, id, additionalLinks = {}) {
  const cleanBase = resourceBaseUri.endsWith('/') ? resourceBaseUri.slice(0, -1) : resourceBaseUri;
  const selfUri = id ? `${cleanBase}/${id}` : cleanBase;

  return {
    self: { href: selfUri, method: 'GET' },
    collection: { href: cleanBase, method: 'GET' },
    ...(id ? {
      replace: { href: selfUri, method: 'PUT' },
      'partial-update': { href: selfUri, method: 'PATCH' },
      delete: { href: selfUri, method: 'DELETE' }
    } : {
      create: { href: cleanBase, method: 'POST' }
    }),
    ...additionalLinks
  };
}

/**
 * Standardized HATEOAS Link Builder for paginated collections
 * @param {string} resourceBaseUri 
 * @param {number} page 
 * @param {number} limit 
 * @param {number} totalItems 
 * @param {object} [queryParams] 
 * @returns {object}
 */
export function buildCollectionLinks(resourceBaseUri, page, limit, totalItems, queryParams = {}) {
  const cleanBase = resourceBaseUri.endsWith('/') ? resourceBaseUri.slice(0, -1) : resourceBaseUri;
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));

  const serializeParams = (p) => {
    const params = new URLSearchParams({ ...queryParams, page: p, limit });
    return `${cleanBase}?${params.toString()}`;
  };

  const links = {
    self: { href: serializeParams(page), method: 'GET' },
    first: { href: serializeParams(1), method: 'GET' },
    last: { href: serializeParams(totalPages), method: 'GET' },
    prev: page > 1 ? { href: serializeParams(page - 1), method: 'GET' } : null,
    next: page < totalPages ? { href: serializeParams(page + 1), method: 'GET' } : null,
    create: { href: cleanBase, method: 'POST' }
  };

  return links;
}

// =========================================================================
// [REQ-1: PURE JSON BACKEND] & [REQ-5: RETURN ACTUAL RESOURCE OBJECTS & ARRAYS]
// Enforces pure JSON output: Content-Type: application/json; charset=utf-8
// Packages payload into { data: { ... }, _links: { ... } } envelope.
// =========================================================================
export function sendSuccess(res, statusCode = 200, data = {}, links = {}, isCacheableGet = false) {
  if (statusCode === 204) {
    res.writeHead(204, {
      'Cache-Control': 'no-store'
    });
    return res.end();
  }

  const payload = {
    data,
    _links: links
  };

  const jsonString = JSON.stringify(payload);

  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(jsonString, 'utf8'),
    'Cache-Control': isCacheableGet ? 'public, max-age=60' : 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY'
  });

  res.end(jsonString);
}

// =========================================================================
// [REQ-1: PURE JSON BACKEND]
// Standardized JSON Error Response adhering strictly to specification.
// Returns: { error: { code, status, message, action, timestamp } }
// =========================================================================
export function sendError(res, status = 500, code = 'INTERNAL_SERVER_ERROR', message = 'An unexpected error occurred.', action = 'Contact support or check server logs.') {
  const errorPayload = {
    error: {
      code,
      status,
      message,
      action,
      timestamp: new Date().toISOString()
    }
  };

  const jsonString = JSON.stringify(errorPayload, null, 2);

  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(jsonString, 'utf8'),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY'
  });

  res.end(jsonString);
}

// =========================================================================
// [REQ-7: STATELESS AUTHENTICATION - JWT TOKENS]
// Pure cryptographic HMAC-SHA256 Stateless Bearer Token generator & verifier.
// Zero in-memory server session state.
// =========================================================================
export function generateStatelessToken(payload, expiresInSeconds = 86400) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const fullPayload = { ...payload, exp, iat: Math.floor(Date.now() / 1000) };

  const encodeBase64Url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const encodedHeader = encodeBase64Url(header);
  const encodedPayload = encodeBase64Url(fullPayload);

  const signature = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Verify and decode Stateless Bearer Token
 * @param {string} token 
 * @returns {object|null} Decoded payload or null if invalid/expired
 */
export function verifyStatelessToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;

  const expectedSignature = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  if (signature !== expectedSignature) {
    return null; // Forgery / invalid signature
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null; // Token expired
    }
    return payload;
  } catch (e) {
    return null;
  }
}

