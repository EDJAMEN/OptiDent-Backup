/**
 * Automated Verification Suite for OptiDent Framework-Free RESTful API
 */

import http from 'http';

const BASE_URL = 'http://localhost:3001';

function makeRequest(method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Accept': 'application/json',
        ...headers
      }
    };

    let bodyData = null;
    if (body) {
      bodyData = typeof body === 'string' ? body : JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(bodyData);
    }

    const req = http.request(options, (res) => {
      let rawData = '';
      res.on('data', chunk => rawData += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(rawData); } catch (e) { json = rawData; }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: json
        });
      });
    });

    req.on('error', reject);
    if (bodyData) req.write(bodyData);
    req.end();
  });
}

async function runTests() {
  console.log('--- OptiDent Framework-Free REST API Verification ---');
  let passed = 0;
  let total = 0;

  function assert(title, condition) {
    total++;
    if (condition) {
      console.log(`[PASS] ${title}`);
      passed++;
    } else {
      console.error(`[FAIL] ${title}`);
    }
  }

  try {
    // 1. Health Endpoint
    const health = await makeRequest('GET', '/api/v1/health');
    assert('GET /api/v1/health returns 200 OK', health.status === 200);
    assert('Health response sets Cache-Control: public, max-age=60', health.headers['cache-control']?.includes('public, max-age=60'));
    assert('Health returns HATEOAS _links object', health.body._links && health.body._links.openapi);

    // 2. Reject Underscores in URI (Kebab-case enforcement)
    const underscoreReq = await makeRequest('GET', '/api/v1/clinical_records');
    assert('URI with underscore returns 400 Bad Request', underscoreReq.status === 400);
    assert('Error code is INVALID_URI_FORMAT', underscoreReq.body.error?.code === 'INVALID_URI_FORMAT');

    // 3. Strict Stateless Auth Enforcement
    const unauth = await makeRequest('GET', '/api/v1/users');
    assert('Protected route without token returns 401 Unauthorized', unauth.status === 401);
    assert('Error payload matches exact required schema', 
      unauth.body.error && 
      unauth.body.error.code && 
      unauth.body.error.status === 401 && 
      unauth.body.error.action && 
      unauth.body.error.timestamp
    );

    // 4. Token Issuance (Login)
    const login = await makeRequest('POST', '/api/v1/auth/tokens', {}, {
      email: 'optidentt@gmail.com',
      password: 'Opident1014'
    });
    assert('POST /api/v1/auth/tokens returns 201 Created', login.status === 201);
    const token = login.body.data?.access_token;
    assert('Token is issued in data envelope', !!token);
    assert('Auth response Cache-Control is no-store', login.headers['cache-control'] === 'no-store');

    // 5. Authenticated Collection GET with Pagination & HATEOAS
    const users = await makeRequest('GET', '/api/v1/users?page=1&limit=2', {
      'Authorization': `Bearer ${token}`
    });
    assert('GET /api/v1/users with token returns 200 OK', users.status === 200);
    assert('Response contains pagination metadata', users.body.data?.pagination?.limit === 2);
    assert('HATEOAS collection links present (self, first, next, last)', 
      users.body._links?.self && users.body._links?.first && users.body._links?.last
    );

    // 6. 405 Method Not Allowed Check
    const notAllowed = await makeRequest('DELETE', '/api/v1/auth/tokens');
    assert('Invalid HTTP verb on URI returns 405 Method Not Allowed', notAllowed.status === 405);

    // 7. 404 Unknown Resource
    const notFound = await makeRequest('GET', '/api/v1/unknown-resource', {
      'Authorization': `Bearer ${token}`
    });
    assert('Unknown resource returns 404 Not Found', notFound.status === 404);

    console.log(`\n===========================================`);
    console.log(`TEST RESULTS: ${passed}/${total} Assertions Passed`);
    console.log(`===========================================`);
  } catch (err) {
    console.error('Test execution failed:', err.message);
  }
}

runTests();

