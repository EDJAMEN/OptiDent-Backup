# OptiDent Dental Clinic Management System — API Reference Manual

> **Document Version:** 2.4.0  
> **Environment:** Node.js (Express), MongoDB Native Driver, REST / JSON  
> **Last Updated:** November 2026  
> **Scope:** Complete directory of all External 3rd-Party APIs and Internal Application REST Endpoints.

---

## Table of Contents
1. [Overview & Architecture](#1-overview--architecture)
2. [External Third-Party APIs & Gateways](#2-external-third-party-apis--gateways)
   - [2.1 Google Identity Services & OAuth 2.0](#21-google-identity-services--oauth-20-api)
   - [2.2 Google Calendar API v3 (Live Two-Way Sync)](#22-google-calendar-api-v3-live-two-way-sync)
   - [2.3 Google reCAPTCHA v2 Anti-Bot Defense](#23-google-recaptcha-v2-anti-bot-defense)
   - [2.4 Gmail SMTP & Nodemailer Transactional Mailer](#24-gmail-smtp--nodemailer-transactional-mailer)
   - [2.5 ImgBB Cloud Media & Imaging API](#25-imgbb-cloud-media--imaging-api)
   - [2.6 QR Code Pass Verification Engine](#26-qr-code-pass-verification-engine)
   - [2.7 UI & Typography CDNs](#27-ui--typography-cdns)
3. [Internal Application REST Endpoints](#3-internal-application-rest-endpoints)
   - [3.1 Authentication & Security (`/api/auth`)](#31-authentication--security-apiauth)
   - [3.2 Super Administrator & Governance (`/api/admin`)](#32-super-administrator--governance-apiadmin)
   - [3.3 Doctor Operatory & Odontogram (`/api/doctor`)](#33-doctor-operatory--odontogram-apidoctor)
   - [3.4 Receptionist & Front-Desk Queue (`/api/receptionist`)](#34-receptionist--front-desk-queue-apireceptionist)
   - [3.5 Client / Patient Self-Service Portal (`/api/client`)](#35-client--patient-self-service-portal-apiclient)
   - [3.6 System Diagnostics & Health (`/api/health`)](#36-system-diagnostics--health-apihealth)
4. [Environment Variables & Secret Configuration](#4-environment-variables--secret-configuration)

---

## 1. Overview & Architecture

OptiDent employs a hybrid API architecture consisting of:
- **External Integration Gateways:** Managed through the centralized **System Integrations & Core API Gateway Hub (SA-008)** in the Super Admin dashboard with real-time AES-256 vault encryption and circuit breakers.
- **Internal RESTful Micro-services:** Layered role-based endpoints (`auth`, `admin`, `doctor`, `receptionist`, `client`) guarded by session tokens, RBAC permission matrices, rate-limiters, and audit loggers.

---

## 2. External Third-Party APIs & Gateways

| Integration Name | Provider | Protocol / Host | Primary Purpose | Status / Circuit Breaker |
|---|---|---|---|---|
| **Google OAuth 2.0** | Google Identity | HTTPS (`oauth2.googleapis.com`) | Single Sign-On (SSO) for Doctors, Staff, and Patients | Switchable via Gateway Hub |
| **Google Calendar v3** | Google Workspace | HTTPS REST (`googleapis.com/calendar/v3`) | Bi-directional appointment synchronization with clinic Google Calendar | Live Sync with Retry Queue |
| **reCAPTCHA v2** | Google Security | HTTPS (`www.google.com/recaptcha/api`) | Anti-bot credential stuffing & brute-force defense on auth forms | Toggleable in System Settings |
| **Gmail SMTP** | Google Workspace / Nodemailer | SMTP over TLS (`smtp.gmail.com:587`) | Staff invites, OTP codes, appointment confirmation slips | Fallback to Mock Log on pause |
| **ImgBB Media API** | ImgBB | HTTPS REST (`api.imgbb.com/1/upload`) | Cloud storage for dental intraoral charts, X-rays & profile avatars | Optional Key in Gateway Hub |
| **QR Code Verification** | Internal HMAC / API-Ninjas | Cryptographic HMAC-SHA256 & QR Render | Contactless front-desk appointment check-in passes | Built-in (Zero Cost) |
| **Google Fonts Inter** | Google Fonts | HTTPS CDN (`fonts.googleapis.com`) | Clinical typography & accessibility typography | Always Online |
| **Boxicons Library** | Boxicons | HTTPS CDN (`unpkg.com/boxicons`) | Standardized iconography across operatory and dashboards | Always Online |

---

### 2.1 Google Identity Services & OAuth 2.0 API
- **Provider:** Google Cloud Platform (GCP)
- **Endpoints Utilized:**
  - Token Exchange: `POST https://oauth2.googleapis.com/token`
  - User Profile Info: `GET https://www.googleapis.com/oauth2/v3/userinfo`
  - Frontend SDK: `https://accounts.google.com/gsi/client`
- **Purpose:** Enables seamless one-tap login and account creation without requiring manual passwords. Automatically links Google accounts to clinic records by email address.
- **Key Environment Variables:**
  - `GOOGLE_CLIENT_ID` (OAuth 2.0 Web Application Client ID)
  - `GOOGLE_CLIENT_SECRET` (Client Secret for backend code exchange)
- **Code Locations:**
  - `api/auth/index.js` (Route: `POST /api/auth/google_login`)
  - `api/config/integrationVerifier.js` (`google_auth_enabled` live probe)
  - `public/index.html` (Google Sign-In button container)

---

### 2.2 Google Calendar API v3 (Live Two-Way Sync)
- **Provider:** Google Workspace / Google Cloud
- **Scope:** `https://www.googleapis.com/auth/calendar.events`
- **Endpoints Utilized:**
  - Event Create: `POST https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events`
  - Event Update: `PUT/PATCH https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events/{eventId}`
  - Event Delete: `DELETE https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events/{eventId}`
- **Purpose:** Automatically inserts, reschedules, or removes appointment blocks on the official clinic Google Calendar (`GOOGLE_CALENDAR_TARGET_EMAIL`) whenever appointments are booked, rescheduled, or cancelled in OptiDent.
- **Key Environment Variables / Files:**
  - `google-service-account.json` (GCP Service Account Private Key & Client Email)
  - `GOOGLE_CALENDAR_TARGET_EMAIL` (Target calendar ID, e.g. `optidentt@gmail.com` or `edjamenf@gmail.com`)
- **Code Locations:**
  - `api/config/googleCalendar.js` (Core Google Calendar client & event builder)
  - `api/admin/index.js` (Routes: `/sync_google_calendar`, `/google_calendar_feed`)
  - `api/client/index.js` & `api/receptionist/index.js` (Triggered upon appointment booking/approval)

---

### 2.3 Google reCAPTCHA v2 Anti-Bot Defense
- **Provider:** Google Security
- **Endpoints Utilized:**
  - Token Verification: `POST https://www.google.com/recaptcha/api/siteverify`
  - Frontend Script: `https://www.google.com/recaptcha/api.js`
- **Purpose:** Protects patient self-registration, public client login, and staff login endpoints against credential stuffing, automated bots, and DDoS brute-force scripts.
- **Key Environment Variables:**
  - `RECAPTCHA_SITE_KEY` (Public site key rendered in frontend checkbox)
  - `RECAPTCHA_SECRET_KEY` (Private secret used by backend server to verify token validity)
- **Code Locations:**
  - `api/config/recaptcha.js` (`verifyRecaptchaToken` middleware)
  - `api/auth/index.js` (Integrated into `/login`, `/client_login`, `/client_register`)

---

### 2.4 Gmail SMTP & Nodemailer Transactional Mailer
- **Provider:** Google Gmail / Nodemailer Transport
- **Protocol:** SMTP over TLS (Port `587` or SSL `465`)
- **Host:** `smtp.gmail.com`
- **Purpose:** Dispatches transactional security codes and notifications:
  - Cryptographically signed Super Admin staff onboarding invitation links.
  - One-Time Password (OTP) codes for account recovery and self-service password reset.
  - Appointment approval notices and booking confirmation slips.
  - Doctor daily operatory schedule briefs.
- **Key Environment Variables:**
  - `SMTP_USER` (Clinic Gmail address, e.g. `optidentt@gmail.com`)
  - `SMTP_PASS` (16-character dedicated Google App Password)
- **Code Locations:**
  - `api/config/mailer.js` (Transporter configuration and HTML email templates)
  - `api/admin/index.js` (Staff invite dispatcher)
  - `api/auth/index.js` (Password reset OTP sender)

---

### 2.5 ImgBB Cloud Media & Imaging API
- **Provider:** ImgBB Cloud Storage
- **Endpoint Utilized:** `POST https://api.imgbb.com/1/upload`
- **Payload:** Multipart/form-data with Base64 image payload and API Key
- **Purpose:** Stores high-resolution dental operatory images:
  - Pre-op and post-op intraoral clinical photographs.
  - Panoramic and periapical dental X-rays.
  - Patient master profile avatars.
- **Key Environment Variables:**
  - `IMGBB_API_KEY` (32-character hexadecimal API Key)
- **Code Locations:**
  - `api/config/integrationVerifier.js` (`imgbb_enabled` automated verification test)
  - `public/js/integrationFields.js` (Field validation schema)

---

### 2.6 QR Code Pass Verification Engine
- **Provider:** Built-in Cryptographic Engine (`crypto` module) & optional API Ninjas Fallback
- **Algorithm:** HMAC-SHA256 signed JWT tokens
- **Purpose:** Contactless front-desk reception check-in. Generates a signed QR badge containing `appointment_id`, `patient_id`, and expiration timestamp. Receptionists scan the QR code via webcam or handheld barcode scanner to instantly verify patient arrival and advance queue position.
- **Key Environment Variables:**
  - `QR_PASS_SECRET` (Cryptographic signing secret)
- **Code Locations:**
  - `api/config/qrPass.js` (`generateAppointmentQRPass`, `verifyAppointmentQRPass`)
  - `api/receptionist/index.js` (Check-in verification endpoint)
  - `api/client/index.js` (Route: `GET /get_appointment_qr`)

---

### 2.7 UI & Typography CDNs
- **Google Fonts CDN:** `https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap`
- **Boxicons CDN:** `https://unpkg.com/boxicons@2.1.4/css/boxicons.min.css`

---

## 3. Internal Application REST Endpoints

### 3.1 Authentication & Security (`/api/auth`)
*Handles identity, sessions, role authorization, and credential recovery.*

| Method | Endpoint | Access Level | Description |
|---|---|---|---|
| `GET` | `/api/auth/recaptcha_config` | Public | Returns whether reCAPTCHA is active and provides the public site key. |
| `GET` | `/api/auth/maintenance_status` | Public | Checks whether the clinic is in Emergency Maintenance mode. |
| `POST` | `/api/auth/login` | Public | Authenticates Staff (`super_admin`, `doctor`, `receptionist`) with password and optional reCAPTCHA. |
| `POST` | `/api/auth/client_login` | Public | Authenticates Client / Patient accounts. |
| `GET` | `/api/auth/google_config` | Public | Returns OAuth Google Client ID for frontend GIS button rendering. |
| `POST` | `/api/auth/google_login` | Public | Exchanges Google credential token for verified session cookie. |
| `GET` | `/api/auth/me` | Authenticated | Retrieves current user profile, active role, and session identity. |
| `GET` | `/api/auth/check_session` | Authenticated | Heartbeat probe validating cookie expiration. |
| `GET` | `/api/auth/my_permissions` | Authenticated | Returns dynamic RBAC permission array for the logged-in user. |
| `POST` | `/api/auth/logout` | Authenticated | Invalidates user session and clears authentication cookies. |
| `POST` | `/api/auth/send_patient_code` | Public | Sends a 6-digit verification code to patient email during self-registration. |
| `POST` | `/api/auth/client_register` | Public | Completes patient account registration with verified code. |
| `GET` | `/api/auth/validate_invite` | Public | Validates a signed Super Admin onboarding token for invited staff. |
| `POST` | `/api/auth/accept_invite` | Public | Allows invited Doctor/Receptionist to set initial password and activate account. |
| `POST` | `/api/auth/forgot_password` | Public | Initiates password reset flow and emails OTP. |
| `POST` | `/api/auth/verify_reset_code` | Public | Validates password reset OTP without mutating record. |
| `POST` | `/api/auth/reset_password` | Public | Sets new password using verified OTP token. |

---

### 3.2 Super Administrator & Governance (`/api/admin`)
*Super Admin governance, system preferences, RBAC matrix, audit trails, and backup vault.*

| Method | Endpoint | Access Level | Description |
|---|---|---|---|
| `GET` | `/api/admin/get_users` | Super Admin | Lists all user accounts with search, role filters, and pagination. |
| `POST` | `/api/admin/create_user` | Super Admin | Manually creates a new staff or patient record. |
| `POST` | `/api/admin/update_user` | Super Admin | Edits user details, role assignment, and contact information. |
| `POST` | `/api/admin/delete_user` | Super Admin | Soft-deletes a user (moves to Recovery Vault SA-006). |
| `POST` | `/api/admin/toggle_user_status`| Super Admin | Activates or suspends user portal access. |
| `GET` | `/api/admin/get_rbac_matrix` | Super Admin | Returns full role-permission mapping (SA-004 matrix). |
| `POST` | `/api/admin/update_role_permissions`| Super Admin | Updates granular permissions for doctor, receptionist, or patient roles. |
| `GET` | `/api/admin/get_audit_logs` | Super Admin | Retrieves immutable system audit trail with timestamp and admin ID. |
| `GET` | `/api/admin/get_system_settings` | Super Admin | Retrieves clinic hours, contact profile, security parameters, and active gateways. |
| `POST` | `/api/admin/update_system_settings`| Super Admin | Persists clinic operating hours, shifts, lunch exceptions, and session timeouts. |
| `POST` | `/api/admin/toggle_integration` | Super Admin | Circuit-breaker switch toggling Google Auth, SMTP, Calendar, reCAPTCHA, etc. |
| `GET` | `/api/admin/get_google_calendar_status`| Super Admin | Verifies live Google Calendar API connectivity and last sync state. |
| `POST` | `/api/admin/sync_google_calendar_now` | Super Admin | Forces an immediate manual bi-directional calendar push. |
| `GET` | `/api/admin/get_deleted_records` | Super Admin | Recovery Vault (SA-006) query of soft-deleted records. |
| `POST` | `/api/admin/restore_record` | Super Admin | Restores a soft-deleted item from Recovery Vault. |
| `POST` | `/api/admin/purge_record` | Super Admin | Permanently erases a soft-deleted record after confirmation. |
| `GET` | `/api/admin/get_archived_records`| Super Admin | Queries cold storage historical archives (SA-007). |
| `POST` | `/api/admin/archive_record` | Super Admin | Moves inactive or completed appointments to historical archive. |
| `GET` | `/api/admin/get_reports_data` | Super Admin | Generates clinic revenue, appointment volume, and treatment distribution metrics. |
| `GET` | `/api/admin/export_csv` | Super Admin | Streams CSV export of earnings, patient demographics, or operatory stats. |
| `GET` | `/api/admin/export_pdf` | Super Admin | Generates printable executive summary report. |
| `GET` | `/api/admin/get_invitations` | Super Admin | Lists pending staff invitation tokens. |
| `POST` | `/api/admin/invite_user` | Super Admin | Issues a cryptographic onboarding token and sends Gmail invite. |
| `POST` | `/api/admin/cancel_invite` | Super Admin | Revokes an unaccepted onboarding invite link. |

---

### 3.3 Doctor Operatory & Odontogram (`/api/doctor`)
*Dental charting, procedural treatments, prescriptions, and daily operatory schedule.*

| Method | Endpoint | Access Level | Description |
|---|---|---|---|
| `GET` | `/api/doctor/get_dashboard_data` | Doctor | Returns doctor's assigned appointments, queue, and treatment roster. |
| `POST` | `/api/doctor/save_clinical_record` | Doctor | Saves clinical notes, interactive 32-tooth odontogram chart, and treatment plans. |
| `GET` | `/api/doctor/get_clinical_records` | Doctor | Fetches full historical treatment records and dental charts for a patient. |
| `POST` | `/api/doctor/update_appointment_status`| Doctor | Advances appointment status (`in_progress`, `completed`, `cancelled`). |
| `POST` | `/api/doctor/approve_appointment` | Doctor | Doctor sign-off on tentative booking requests. |
| `GET` | `/api/doctor/get_patient_medical_history`| Doctor | Accesses patient medical alerts, allergies, and systemic conditions. |
| `POST` | `/api/doctor/update_schedule` | Doctor | Configures personal chairside duty shifts and doctor break times. |
| `POST` | `/api/doctor/email_today_schedule`| Doctor | Dispatches today's treatment schedule summary to doctor's registered email. |

---

### 3.4 Receptionist & Front-Desk Queue (`/api/receptionist`)
*Front-desk booking, chairside queue management, walk-in intake, and patient directory.*

| Method | Endpoint | Access Level | Description |
|---|---|---|---|
| `GET` | `/api/receptionist/get_dashboard_data` | Receptionist | Returns today's active appointments, live chairside queue, and doctor availability. |
| `POST` | `/api/receptionist/create_appointment` | Receptionist | Books a new appointment with doctor assignment and service selection. |
| `POST` | `/api/receptionist/update_appointment` | Receptionist | Modifies appointment time, notes, service, or assigned dentist. |
| `POST` | `/api/receptionist/reschedule_appointment`| Receptionist | Moves appointment to a new date/slot and syncs with Google Calendar. |
| `POST` | `/api/receptionist/cancel_appointment` | Receptionist | Cancels booking and dispatches notification. |
| `POST` | `/api/receptionist/update_appointment_status`| Receptionist | Updates status (`arrived`, `seated`, `checked_in`). |
| `GET` | `/api/receptionist/search_patients` | Receptionist | Real-time patient directory search by name, phone, or email. |
| `POST` | `/api/receptionist/register_patient` | Receptionist | Registers a walk-in patient profile at the front desk. |
| `POST` | `/api/receptionist/checkin_returning_patient`| Receptionist | Scans signed QR check-in pass or logs returning patient arrival. |
| `POST` | `/api/receptionist/reorder_queue` | Receptionist | Drag-and-drop chairside queue priority reordering. |
| `GET` | `/api/receptionist/get_doctor_schedule_slots`| Receptionist | Computes real-time available time slots based on doctor schedules and existing bookings. |

---

### 3.5 Client / Patient Self-Service Portal (`/api/client`)
*Self-booking, appointment rescheduling, electronic health records, and contactless check-in passes.*

| Method | Endpoint | Access Level | Description |
|---|---|---|---|
| `GET` | `/api/client/get_dashboard_data` | Patient | Fetches upcoming appointments, past treatment history, and clinic notices. |
| `GET` | `/api/client/get_services` | Public / Patient | Lists available dental procedures and standard pricing. |
| `GET` | `/api/client/get_available_slots` | Public / Patient | Returns open appointment slots honoring clinic working hours. |
| `POST` | `/api/client/book_appointment` | Patient | Submits a new appointment booking request. |
| `POST` | `/api/client/reschedule_appointment` | Patient | Reschedules an upcoming appointment. |
| `POST` | `/api/client/cancel_appointment` | Patient | Cancels an upcoming appointment. |
| `GET` | `/api/client/get_medical_history` | Patient | Retrieves verified medical history, dental records, and post-op recall dates. |
| `POST` | `/api/client/update_profile` | Patient | Updates contact info, address, and profile preferences. |
| `GET` | `/api/client/get_appointment_qr` | Patient | Generates signed digital QR Pass for contactless reception check-in. |
| `GET` | `/api/client/get_appointment_ics` | Patient | Downloads `.ics` iCalendar calendar file for Apple/Outlook integration. |

---

### 3.6 System Diagnostics & Health (`/api/health`)
*System uptime, database connection status, and cluster diagnostics.*

| Method | Endpoint | Access Level | Description |
|---|---|---|---|
| `GET` | `/api/health` | Public | Returns server uptime, memory usage, and MongoDB connection status. |

---

## 4. Environment Variables & Secret Configuration

To configure all integrations, update your `.env` file in the project root:

```env
# SERVER & PORT
PORT=3000
NODE_ENV=production
SESSION_SECRET=your_super_secret_session_encryption_key_here

# MONGODB NATIVE DATABASE
MONGODB_URI=mongodb://127.0.0.1:27017/optident_db
DB_NAME=optident_db

# 1. GOOGLE OAUTH 2.0 (SSO)
GOOGLE_CLIENT_ID=xxxxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx

# 2. GOOGLE CALENDAR LIVE SYNC (SERVICE ACCOUNT)
GOOGLE_CALENDAR_TARGET_EMAIL=optidentt@gmail.com
# Google Service Account credentials located in: google-service-account.json

# 3. GMAIL SMTP MAILER
SMTP_USER=optidentt@gmail.com
SMTP_PASS=xxxxxxxxxxxxxxxx

# 4. GOOGLE RECAPTCHA V2
RECAPTCHA_SITE_KEY=6Lxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
RECAPTCHA_SECRET_KEY=6Lxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# 5. IMGBB IMAGE HOSTING
IMGBB_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# 6. QR CHECK-IN ENGINE
QR_PASS_SECRET=your_qr_hmac_signing_secret_here
```

---

## 5. Security & Verification Summary

1. **At-Rest Token Encryption:** All external API secrets entered through the Super Admin Gateway Hub (`admin_dashboard.html`) are encrypted with **AES-256-GCM** before writing to MongoDB.
2. **Zero Plaintext Display:** All frontend views display masked strings (e.g. `6LeI••••••••••••••••fJWe`) with no plaintext leak in network payloads.
3. **Live Verification Engine:** The backend runs live credential probes in `api/config/integrationVerifier.js` prior to activating any third-party gateway.
