# OptiDent Framework-Free RESTful API Architecture

## 1. Architectural Compliance Audit (Existing System vs. Master Prompt)

When auditing the legacy/primary OptiDent system (`OptiDent_NodeJS/`) against the Master Prompt specifications, the following architectural violations were identified:

| Constraint | Legacy System Implementation (`OptiDent_NodeJS`) | Master Prompt Specification | Status |
| :--- | :--- | :--- | :--- |
| **Framework Dependency** | Uses `Express.js`, `express-session`, and `cors`. | **Zero web frameworks**. Pure Node.js runtime core modules (`http`, `url`, `crypto`). | **VIOLATION (Legacy)** |
| **Separation of Concerns** | Routes and business logic combined inside Express `Router()` instances. | Strict separation: `server.js` (I/O & routing only), `controllers/` (business logic only), `utils/httpHelper.js`. | **VIOLATION (Legacy)** |
| **Statelessness** | Stateful server-side cookies (`express-session` with `req.session.user`). | **Strict statelessness**. Every request authenticated independently via `Authorization: Bearer <token>` or `X-API-Key`. | **VIOLATION (Legacy)** |
| **URI Naming Conventions** | Verb-based endpoints and underscores (e.g., `/get_audit_logs`, `/book_appointment`, `/restore_record`). | **Plural nouns only** with **kebab-case (-)**. Active rejection of any URL with underscores (`_`) returning `400 Bad Request`. | **VIOLATION (Legacy)** |
| **HATEOAS Controls** | Varied flat JSON payloads without hypermedia links. | Every success response includes a `_links` object with `href` and `method` (`self`, `collection`, `replace`, etc.). | **VIOLATION (Legacy)** |
| **Error Handling Schema** | Varied `{ success: false, message: ... }` schemas. | Exact standardized schema: `{ error: { code, status, message, action, timestamp } }`. | **VIOLATION (Legacy)** |
| **Explicit Cacheability** | Default browser caching headers. | Explicit `Cache-Control: public, max-age=60` on safe `GET`; `no-store` on mutations/errors. | **VIOLATION (Legacy)** |
| **Request Timeout** | Unbounded request socket lifetimes. | Strict `10000ms` connection timeout returning `408 Request Timeout`. | **VIOLATION (Legacy)** |

---

## 2. Directory Architecture & Layered Layout

The refactored framework-free implementation resides inside `OptiDent_FrameworkFree_API/` and is strictly isolated from the working dashboard system:

```text
OptiDent_FrameworkFree_API/
├── package.json                   # Pure Node.js configuration (type: module, zero web frameworks)
├── server.js                      # Native http/url server, 10s timeout, latency logger, stateless auth, routing
├── openapi.yaml                   # OpenAPI 3.0 specification for all versioned endpoints
├── test_api.mjs                   # Automated REST compliance test suite
├── utils/
│   ├── httpHelper.js              # Body parser (1MB cap / 413), HATEOAS builder, error generator, stateless JWT
│   └── database.js                # Native MongoDB connection pooling with resilient fallback
└── controllers/
    ├── authController.js          # POST /api/v1/auth/tokens, POST /api/v1/auth/registrations
    ├── usersController.js         # GET, POST, GET/:id, PUT/:id, PATCH/:id, DELETE/:id for /api/v1/users
    ├── appointmentsController.js  # GET, POST, GET/:id, PUT/:id, PATCH/:id, DELETE/:id for /api/v1/appointments
    ├── servicesController.js      # GET, POST, GET/:id, PUT/:id, PATCH/:id, DELETE/:id for /api/v1/services
    ├── clinicalRecordsController.js # GET, POST, GET/:id, PUT/:id, PATCH/:id, DELETE/:id for /api/v1/clinical-records
    ├── auditLogsController.js     # GET, POST, GET/:id for /api/v1/audit-logs (PHT Asia/Manila)
    └── recoveryVaultController.js # GET, POST /:id/restorations, DELETE /:id for /api/v1/recovery-vault
```

---

## 3. How to Run the Framework-Free Server

The framework-free server is configured to run on **Port 3001** (leaving Port 3000 free for the primary OptiDent dashboard server).

### Start the Server:
```bash
cd OptiDent_FrameworkFree_API
node server.js
```

### Run the Automated REST Test Suite:
```bash
cd OptiDent_FrameworkFree_API
node test_api.mjs
```

---

## 4. RESTful API Endpoints Catalog

### Authentication & Identity
* `POST /api/v1/auth/tokens` — Issue stateless Bearer token (Login)
* `POST /api/v1/auth/registrations` — Self-service patient account registration

### Users (`/api/v1/users`)
* `GET /api/v1/users?page=1&limit=10&role=...` — Paginated list with HATEOAS collection links
* `POST /api/v1/users` — Create user (Returns `201 Created` with `Location` header)
* `GET /api/v1/users/{id}` — Retrieve single user
* `PUT /api/v1/users/{id}` — Complete replacement of user entity
* `PATCH /api/v1/users/{id}` — Partial field update (name, phone, role, status)
* `DELETE /api/v1/users/{id}` — Soft-delete user into Data Recovery Vault (Returns `204 No Content`)

### Appointments (`/api/v1/appointments`)
* `GET /api/v1/appointments?page=1&limit=10&status=...&date=...` — Paginated visits
* `POST /api/v1/appointments` — Create appointment (with slot conflict prevention)
* `GET /api/v1/appointments/{id}` — Retrieve single appointment
* `PUT /api/v1/appointments/{id}` — Full replacement
* `PATCH /api/v1/appointments/{id}` — Update status (`scheduled`, `in_progress`, `completed`, `cancelled`), notes, operatory chair
* `DELETE /api/v1/appointments/{id}` — Cancel appointment

### Dental Services (`/api/v1/services`)
* `GET /api/v1/services` — List dental procedures catalog
* `POST /api/v1/services` — Create new dental service
* `GET /api/v1/services/{id}` — Service details
* `PUT /api/v1/services/{id}` — Replace service
* `PATCH /api/v1/services/{id}` — Update fee, duration, description
* `DELETE /api/v1/services/{id}` — Deactivate service

### Clinical Records & Odontogram (`/api/v1/clinical-records`)
* `GET /api/v1/clinical-records?patient_email=...` — Patient clinical charts
* `POST /api/v1/clinical-records` — Record consultation, diagnosis, and tooth surfaces
* `GET /api/v1/clinical-records/{id}` — Single chart entry
* `PUT /api/v1/clinical-records/{id}` — Full replacement
* `PATCH /api/v1/clinical-records/{id}` — Partial chart notes update
* `DELETE /api/v1/clinical-records/{id}` — Archive record

### Forensic Audit Trail (`/api/v1/audit-logs`)
* `GET /api/v1/audit-logs?action=...` — Paginated logs with timestamps in Asia/Manila Standard Time
* `POST /api/v1/audit-logs` — Log administrative event
* `GET /api/v1/audit-logs/{id}` — Single audit record

### Data Recovery Vault (`/api/v1/recovery-vault`)
* `GET /api/v1/recovery-vault?collection=...` — List soft-deleted records
* `POST /api/v1/recovery-vault/{id}/restorations?collection=...` — Restore soft-deleted record
* `DELETE /api/v1/recovery-vault/{id}?collection=...` — Permanently purge record from database

