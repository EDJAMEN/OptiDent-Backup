# OptiDent Dental Clinic Management System — Complete API Endpoints List & Code Locator Guide

> **Base URL:** `http://localhost:3000`  
> **Architecture:** Node.js, Express, Native MongoDB Driver  
> **Search Tag Format in Code:** `// @endpoint [METHOD] [PATH] - [Description]`  
> **Total Cataloged Endpoints:** 108 unique endpoints  
> **Format:** Standard REST / JSON  

---

## 🔍 How to Find Any Endpoint in the Source Code

Every route in the backend source code is now annotated with a standardized searchable comment tag directly above the handler.

### 1. Global Search in Your IDE (VS Code / Cursor / Sublime)
- Press **`Ctrl + Shift + F`** (Windows) or **`Cmd + Shift + F`** (Mac) to open Global Search.
- To view **ALL** endpoints across the system, simply search:
  ```
  @endpoint
  ```
- To jump directly to a specific endpoint, search its full tag or path:
  ```
  @endpoint POST /api/auth/login
  ```
  or simply:
  ```
  /api/client/book_appointment
  ```

### 2. Search Within a File
- Open the corresponding router file from the table below.
- Press **`Ctrl + F`** and search the route subpath (e.g., `'/login'` or `'/get_users'`).

---

## 📁 Source Code File Mapping

| Module Name | File in `OptiDent_NodeJS` | File in `OptiDent_System_Final` | Base Route |
|---|---|---|---|
| **System Health & Root** | [`server.js`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/server.js) | [`server.js`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/server.js) | `/`, `/api/health` |
| **Auth & Access Control** | [`api/auth/index.js`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/auth/index.js) | [`api/auth/index.js`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/auth/index.js) | `/api/auth` |
| **Client / Patient Portal** | [`api/client/index.js`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/client/index.js) | [`api/client/index.js`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/client/index.js) | `/api/client` |
| **Doctor Operatory** | [`api/doctor/index.js`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/doctor/index.js) | [`api/doctor/index.js`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/doctor/index.js) | `/api/doctor` |
| **Receptionist & Queue** | [`api/receptionist/index.js`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/receptionist/index.js) | [`api/receptionist/index.js`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/receptionist/index.js) | `/api/receptionist` |
| **Super Admin & Governance** | [`api/admin/index.js`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/admin/index.js) | [`api/admin/index.js`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/admin/index.js) | `/api/admin` |
| **Reports Engine** | *(Shared in System_Final)* | [`api/reports/index.js`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/reports/index.js) | `/api/reports` |

---

## 1.0 AUTHENTICATION & ACCESS CONTROL MODULE

### Module Description
This module governs identity verification, multi-role session tokens, Google OAuth 2.0 Single Sign-On (SSO), anti-bot reCAPTCHA defenses, staff onboarding invites, and self-service password recovery workflows. It controls entry for all user roles: Super Admin, Doctors, Receptionists, and Patients.

**Source Files:**  
- `OptiDent_NodeJS`: [`api/auth/index.js`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/auth/index.js)  
- `OptiDent_System_Final`: [`api/auth/index.js`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/auth/index.js)  

### Endpoints & Code Search Reference

#### `GET http://localhost:3000/api/auth/recaptcha_config`
- **Description:** Returns public reCAPTCHA site key and status for login bot defense
- **Search in Code:** `@endpoint GET /api/auth/recaptcha_config`
- **File Locations:** [`OptiDent_NodeJS/api/auth/index.js#L14`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/auth/index.js#L14) | [`OptiDent_System_Final/api/auth/index.js#L15`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/auth/index.js#L15)

#### `GET http://localhost:3000/api/auth/maintenance_status`
- **Description:** Checks whether clinic-wide Emergency Maintenance Mode is currently active
- **Search in Code:** `@endpoint GET /api/auth/maintenance_status`
- **File Locations:** [`OptiDent_NodeJS/api/auth/index.js#L41`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/auth/index.js#L41) | [`OptiDent_System_Final/api/auth/index.js#L42`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/auth/index.js#L42)

#### `POST http://localhost:3000/api/auth/login`
- **Description:** Authenticates clinic staff (Super Admin, Doctor, Receptionist) with credentials and reCAPTCHA
- **Search in Code:** `@endpoint POST /api/auth/login`
- **File Locations:** [`OptiDent_NodeJS/api/auth/index.js#L60`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/auth/index.js#L60) | [`OptiDent_System_Final/api/auth/index.js#L61`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/auth/index.js#L61)

#### `POST http://localhost:3000/api/auth/client_login`
- **Description:** Authenticates registered patients into the patient self-service portal
- **Search in Code:** `@endpoint POST /api/auth/client_login`
- **File Locations:** [`OptiDent_NodeJS/api/auth/index.js#L217`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/auth/index.js#L217) | [`OptiDent_System_Final/api/auth/index.js#L218`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/auth/index.js#L218)

#### `GET http://localhost:3000/api/auth/google_config`
- **Description:** Provides Google OAuth 2.0 Client ID for client-side Google Identity Services
- **Search in Code:** `@endpoint GET /api/auth/google_config`
- **File Locations:** [`OptiDent_NodeJS/api/auth/index.js#L226`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/auth/index.js#L226) | [`OptiDent_System_Final/api/auth/index.js#L227`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/auth/index.js#L227)

#### `POST http://localhost:3000/api/auth/google_login`
- **Description:** Exchanges Google credential tokens for authenticated clinic session cookie
- **Search in Code:** `@endpoint POST /api/auth/google_login`
- **File Locations:** [`OptiDent_NodeJS/api/auth/index.js#L246`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/auth/index.js#L246) | [`OptiDent_System_Final/api/auth/index.js#L254`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/auth/index.js#L254)

#### `GET http://localhost:3000/api/auth/me`
- **Description:** Retrieves profile details and current role for the active session
- **Search in Code:** `@endpoint GET /api/auth/me`
- **File Locations:** [`OptiDent_NodeJS/api/auth/index.js#L393`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/auth/index.js#L393) | [`OptiDent_System_Final/api/auth/index.js#L419`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/auth/index.js#L419)

#### `GET http://localhost:3000/api/auth/check_session`
- **Description:** Heartbeat probe validating session cookie validity and lifetime
- **Search in Code:** `@endpoint GET /api/auth/check_session`
- **File Locations:** [`OptiDent_NodeJS/api/auth/index.js#L395`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/auth/index.js#L395) | [`OptiDent_System_Final/api/auth/index.js#L421`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/auth/index.js#L421)

#### `GET http://localhost:3000/api/auth/my_permissions`
- **Description:** Fetches dynamic RBAC permission keys assigned to authenticated user role
- **Search in Code:** `@endpoint GET /api/auth/my_permissions`
- **File Locations:** [`OptiDent_NodeJS/api/auth/index.js#L401`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/auth/index.js#L401) | [`OptiDent_System_Final/api/auth/index.js#L427`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/auth/index.js#L427)

#### `POST http://localhost:3000/api/auth/logout`
- **Description:** Destroys session on the server and clears authentication cookies
- **Search in Code:** `@endpoint POST /api/auth/logout`
- **File Locations:** [`OptiDent_NodeJS/api/auth/index.js#L507`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/auth/index.js#L507) | [`OptiDent_System_Final/api/auth/index.js#L533`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/auth/index.js#L533)

#### `POST http://localhost:3000/api/auth/send_patient_code`
- **Description:** Sends 6-digit email OTP verification code to unverified patient registrants
- **Search in Code:** `@endpoint POST /api/auth/send_patient_code`
- **File Locations:** [`OptiDent_NodeJS/api/auth/index.js#L522`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/auth/index.js#L522) | [`OptiDent_System_Final/api/auth/index.js#L548`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/auth/index.js#L548)

#### `POST http://localhost:3000/api/auth/client_register`
- **Description:** Finalizes patient account creation upon submitting correct verification code
- **Search in Code:** `@endpoint POST /api/auth/client_register`
- **File Locations:** [`OptiDent_NodeJS/api/auth/index.js#L617`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/auth/index.js#L617) | [`OptiDent_System_Final/api/auth/index.js#L643`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/auth/index.js#L643)

#### `POST http://localhost:3000/api/auth/client_register_step1`
- **Description:** Validates initial personal details and pre-checks email uniqueness
- **Search in Code:** `@endpoint POST /api/auth/client_register_step1`
- **File Locations:** [`OptiDent_NodeJS/api/auth/index.js#L722`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/auth/index.js#L722) | [`OptiDent_System_Final/api/auth/index.js#L748`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/auth/index.js#L748)

#### `POST http://localhost:3000/api/auth/accept_invite`
- **Description:** Allows newly invited Doctor or Receptionist to set password and activate account
- **Search in Code:** `@endpoint POST /api/auth/accept_invite`
- **File Locations:** [`OptiDent_NodeJS/api/auth/index.js#L847`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/auth/index.js#L847) | [`OptiDent_System_Final/api/auth/index.js#L873`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/auth/index.js#L873)

#### `GET http://localhost:3000/api/auth/validate_invite`
- **Description:** Validates cryptographic onboarding invite tokens issued by Super Admin
- **Search in Code:** `@endpoint GET /api/auth/validate_invite`
- **File Locations:** [`OptiDent_NodeJS/api/auth/index.js#L1032`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/auth/index.js#L1032) | [`OptiDent_System_Final/api/auth/index.js#L1058`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/auth/index.js#L1058)

#### `POST http://localhost:3000/api/auth/forgot_password`
- **Description:** Initiates self-service password reset flow and emails a time-limited OTP
- **Search in Code:** `@endpoint POST /api/auth/forgot_password`
- **File Locations:** [`OptiDent_NodeJS/api/auth/index.js#L1091`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/auth/index.js#L1091) | [`OptiDent_System_Final/api/auth/index.js#L1117`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/auth/index.js#L1117)

#### `POST http://localhost:3000/api/auth/verify_reset_code`
- **Description:** Validates submitted OTP without committing password mutation
- **Search in Code:** `@endpoint POST /api/auth/verify_reset_code`
- **File Locations:** [`OptiDent_NodeJS/api/auth/index.js#L1156`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/auth/index.js#L1156) | [`OptiDent_System_Final/api/auth/index.js#L1182`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/auth/index.js#L1182)

#### `POST http://localhost:3000/api/auth/reset_password`
- **Description:** Updates account password using validated recovery token
- **Search in Code:** `@endpoint POST /api/auth/reset_password`
- **File Locations:** [`OptiDent_NodeJS/api/auth/index.js#L1205`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/auth/index.js#L1205) | [`OptiDent_System_Final/api/auth/index.js#L1231`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/auth/index.js#L1231)

---

## 2.0 CLIENT / PATIENT PORTAL MODULE

### Module Description
This module provides self-service capabilities for dental clinic patients. It enables patients to view their upcoming and past appointments, search available clinic slots based on working shifts, book/reschedule dental visits, inspect treatment histories, view notifications, and access contactless QR check-in passes.

**Source Files:**  
- `OptiDent_NodeJS`: [`api/client/index.js`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/client/index.js)  
- `OptiDent_System_Final`: [`api/client/index.js`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/client/index.js)  

### Endpoints & Code Search Reference

#### `GET http://localhost:3000/api/client/get_dashboard_data`
- **Description:** Returns upcoming appointments, recent treatments, notifications, and announcements
- **Search in Code:** `@endpoint GET /api/client/get_dashboard_data`
- **File Locations:** [`OptiDent_NodeJS/api/client/index.js#L53`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/client/index.js#L53) | [`OptiDent_System_Final/api/client/index.js#L55`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/client/index.js#L55)

#### `GET http://localhost:3000/api/client/get_services`
- **Description:** Lists active clinic dental treatments, descriptions, durations, and fees
- **Search in Code:** `@endpoint GET /api/client/get_services`
- **File Locations:** [`OptiDent_NodeJS/api/client/index.js#L188`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/client/index.js#L188) | [`OptiDent_System_Final/api/client/index.js#L190`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/client/index.js#L190)

#### `POST http://localhost:3000/api/client/book_appointment`
- **Description:** Creates a new dental appointment booking request
- **Search in Code:** `@endpoint POST /api/client/book_appointment`
- **File Locations:** [`OptiDent_NodeJS/api/client/index.js#L208`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/client/index.js#L208) | [`OptiDent_System_Final/api/client/index.js#L210`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/client/index.js#L210)

#### `POST http://localhost:3000/api/client/reschedule_appointment`
- **Description:** Moves an existing appointment to a new date/time slot with calendar sync
- **Search in Code:** `@endpoint POST /api/client/reschedule_appointment`
- **File Locations:** [`OptiDent_NodeJS/api/client/index.js#L334`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/client/index.js#L334) | [`OptiDent_System_Final/api/client/index.js#L336`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/client/index.js#L336)

#### `POST http://localhost:3000/api/client/cancel_appointment`
- **Description:** Cancels an upcoming appointment and notifies clinic staff
- **Search in Code:** `@endpoint POST /api/client/cancel_appointment`
- **File Locations:** [`OptiDent_NodeJS/api/client/index.js#L412`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/client/index.js#L412) | [`OptiDent_System_Final/api/client/index.js#L414`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/client/index.js#L414)

#### `GET http://localhost:3000/api/client/get_available_slots`
- **Description:** Calculates open chairside slots respecting clinic operating hours and lunch break
- **Search in Code:** `@endpoint GET /api/client/get_available_slots`
- **File Locations:** [`OptiDent_NodeJS/api/client/index.js#L476`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/client/index.js#L476) | [`OptiDent_System_Final/api/client/index.js#L478`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/client/index.js#L478)

#### `GET http://localhost:3000/api/client/get_medical_history`
- **Description:** Retrieves verified medical conditions, allergies, clinical history, and recalls
- **Search in Code:** `@endpoint GET /api/client/get_medical_history`
- **File Locations:** [`OptiDent_NodeJS/api/client/index.js#L563`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/client/index.js#L563) | [`OptiDent_System_Final/api/client/index.js#L565`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/client/index.js#L565)

#### `POST http://localhost:3000/api/client/update_profile`
- **Description:** Updates patient contact information, address, and emergency contact details
- **Search in Code:** `@endpoint POST /api/client/update_profile`
- **File Locations:** [`OptiDent_NodeJS/api/client/index.js#L621`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/client/index.js#L621) | [`OptiDent_System_Final/api/client/index.js#L623`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/client/index.js#L623)

#### `POST http://localhost:3000/api/client/complete_profile`
- **Description:** Saves comprehensive medical disclosure during first-time onboarding
- **Search in Code:** `@endpoint POST /api/client/complete_profile`
- **File Locations:** [`OptiDent_NodeJS/api/client/index.js#L695`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/client/index.js#L695) | [`OptiDent_System_Final/api/client/index.js#L697`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/client/index.js#L697)

#### `GET http://localhost:3000/api/client/get_notifications`
- **Description:** Fetches unread and historical in-app notifications
- **Search in Code:** `@endpoint GET /api/client/get_notifications`
- **File Locations:** [`OptiDent_NodeJS/api/client/index.js#L755`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/client/index.js#L755) | [`OptiDent_System_Final/api/client/index.js#L757`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/client/index.js#L757)

#### `POST http://localhost:3000/api/client/mark_notification_read`
- **Description:** Marks a specific notification or all notifications as read
- **Search in Code:** `@endpoint POST /api/client/mark_notification_read`
- **File Locations:** [`OptiDent_NodeJS/api/client/index.js#L787`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/client/index.js#L787) | [`OptiDent_System_Final/api/client/index.js#L789`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/client/index.js#L789)

#### `POST http://localhost:3000/api/client/send_otp`
- **Description:** Dispatches OTP verification code to patient contact email
- **Search in Code:** `@endpoint POST /api/client/send_otp`
- **File Locations:** [`OptiDent_NodeJS/api/client/index.js#L818`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/client/index.js#L818) | [`OptiDent_System_Final/api/client/index.js#L820`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/client/index.js#L820)

#### `POST http://localhost:3000/api/client/verify_otp`
- **Description:** Verifies patient OTP for sensitive profile or appointment alterations
- **Search in Code:** `@endpoint POST /api/client/verify_otp`
- **File Locations:** [`OptiDent_NodeJS/api/client/index.js#L872`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/client/index.js#L872) | [`OptiDent_System_Final/api/client/index.js#L874`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/client/index.js#L874)

#### `POST http://localhost:3000/api/client/update_notification_preferences`
- **Description:** Toggles email notification preferences
- **Search in Code:** `@endpoint POST /api/client/update_notification_preferences`
- **File Locations:** [`OptiDent_NodeJS/api/client/index.js#L933`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/client/index.js#L933) | [`OptiDent_System_Final/api/client/index.js#L935`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/client/index.js#L935)

#### `GET http://localhost:3000/api/client/get_appointment_qr`
- **Description:** Generates cryptographically signed HMAC QR Check-in Pass for front-desk scanning
- **Search in Code:** `@endpoint GET /api/client/get_appointment_qr`
- **File Locations:** [`OptiDent_NodeJS/api/client/index.js#L967`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/client/index.js#L967) | [`OptiDent_System_Final/api/client/index.js#L983`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/client/index.js#L983)

#### `GET http://localhost:3000/api/client/get_appointment_ics`
- **Description:** Generates an .ics iCalendar file for importing appointment into calendar apps
- **Search in Code:** `@endpoint GET /api/client/get_appointment_ics`
- **File Locations:** [`OptiDent_NodeJS/api/client/index.js#L1004`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/client/index.js#L1004) | [`OptiDent_System_Final/api/client/index.js#L1024`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/client/index.js#L1024)

#### `GET http://localhost:3000/api/client/qr_image`
- **Description:** Streams QR code check-in image dynamically for scanning
- **Search in Code:** `@endpoint GET /api/client/qr_image`
- **File Locations:** [`OptiDent_System_Final/api/client/index.js#L1007`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/client/index.js#L1007)

---

## 3.0 DOCTOR OPERATORY & ODONTOGRAM MODULE

### Module Description
This module provides operational workflows for dentists and clinical staff. It handles chairside patient care, electronic dental charting via an interactive 32-tooth odontogram, treatment plan recording, procedure statuses, duty availability configurations, and automated email dispatches of daily operatory rosters.

**Source Files:**  
- `OptiDent_NodeJS`: [`api/doctor/index.js`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/doctor/index.js)  
- `OptiDent_System_Final`: [`api/doctor/index.js`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/doctor/index.js)  

### Endpoints & Code Search Reference

#### `GET http://localhost:3000/api/doctor/get_dashboard_data`
- **Description:** Returns today's assigned appointments, queue status, and active patient count
- **Search in Code:** `@endpoint GET /api/doctor/get_dashboard_data`
- **File Locations:** [`OptiDent_NodeJS/api/doctor/index.js#L17`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/doctor/index.js#L17) | [`OptiDent_System_Final/api/doctor/index.js#L18`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/doctor/index.js#L18)

#### `POST http://localhost:3000/api/doctor/save_clinical_record`
- **Description:** Saves 32-tooth odontogram conditions, clinical diagnosis, prescriptions, and post-op care
- **Search in Code:** `@endpoint POST /api/doctor/save_clinical_record`
- **File Locations:** [`OptiDent_NodeJS/api/doctor/index.js#L257`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/doctor/index.js#L257) | [`OptiDent_System_Final/api/doctor/index.js#L258`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/doctor/index.js#L258)

#### `POST http://localhost:3000/api/doctor/update_appointment_status`
- **Description:** Transitions appointment state (confirmed, in_progress, completed, cancelled)
- **Search in Code:** `@endpoint POST /api/doctor/update_appointment_status`
- **File Locations:** [`OptiDent_NodeJS/api/doctor/index.js#L349`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/doctor/index.js#L349) | [`OptiDent_System_Final/api/doctor/index.js#L350`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/doctor/index.js#L350)

#### `POST http://localhost:3000/api/doctor/approve_appointment`
- **Description:** Approves patient self-booking requests and assigns operatory chair
- **Search in Code:** `@endpoint POST /api/doctor/approve_appointment`
- **File Locations:** [`OptiDent_NodeJS/api/doctor/index.js#L395`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/doctor/index.js#L395) | [`OptiDent_System_Final/api/doctor/index.js#L396`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/doctor/index.js#L396)

#### `POST http://localhost:3000/api/doctor/update_profile`
- **Description:** Updates doctor professional bio, specialization, and contact information
- **Search in Code:** `@endpoint POST /api/doctor/update_profile`
- **File Locations:** [`OptiDent_NodeJS/api/doctor/index.js#L435`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/doctor/index.js#L435) | [`OptiDent_System_Final/api/doctor/index.js#L436`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/doctor/index.js#L436)

#### `POST http://localhost:3000/api/doctor/change_password`
- **Description:** Updates doctor account portal password
- **Search in Code:** `@endpoint POST /api/doctor/change_password`
- **File Locations:** [`OptiDent_NodeJS/api/doctor/index.js#L465`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/doctor/index.js#L465) | [`OptiDent_System_Final/api/doctor/index.js#L466`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/doctor/index.js#L466)

#### `POST http://localhost:3000/api/doctor/update_schedule`
- **Description:** Configures doctor clinical duty hours, off-duty days, and chair allocation
- **Search in Code:** `@endpoint POST /api/doctor/update_schedule`
- **File Locations:** [`OptiDent_NodeJS/api/doctor/index.js#L546`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/doctor/index.js#L546) | [`OptiDent_System_Final/api/doctor/index.js#L547`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/doctor/index.js#L547)

#### `GET http://localhost:3000/api/doctor/get_patient_medical_history`
- **Description:** Displays patient medical alerts, systemic conditions, and allergy warnings
- **Search in Code:** `@endpoint GET /api/doctor/get_patient_medical_history`
- **File Locations:** [`OptiDent_NodeJS/api/doctor/index.js#L612`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/doctor/index.js#L612) | [`OptiDent_System_Final/api/doctor/index.js#L613`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/doctor/index.js#L613)

#### `GET http://localhost:3000/api/doctor/get_clinical_records`
- **Description:** Fetches complete chronological clinical history and visual odontogram states
- **Search in Code:** `@endpoint GET /api/doctor/get_clinical_records`
- **File Locations:** [`OptiDent_NodeJS/api/doctor/index.js#L805`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/doctor/index.js#L805) | [`OptiDent_System_Final/api/doctor/index.js#L806`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/doctor/index.js#L806)

#### `POST http://localhost:3000/api/doctor/delete_record_history`
- **Description:** Removes or archives an outdated treatment note entry
- **Search in Code:** `@endpoint POST /api/doctor/delete_record_history`
- **File Locations:** [`OptiDent_NodeJS/api/doctor/index.js#L885`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/doctor/index.js#L885) | [`OptiDent_System_Final/api/doctor/index.js#L886`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/doctor/index.js#L886)

#### `POST http://localhost:3000/api/doctor/email_today_schedule`
- **Description:** Dispatches automated email with today's scheduled patients and treatments
- **Search in Code:** `@endpoint POST /api/doctor/email_today_schedule`
- **File Locations:** [`OptiDent_NodeJS/api/doctor/index.js#L1013`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/doctor/index.js#L1013) | [`OptiDent_System_Final/api/doctor/index.js#L1014`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/doctor/index.js#L1014)

#### `GET http://localhost:3000/api/doctor/email_today_schedule`
- **Description:** Queries today's chairside schedule summary
- **Search in Code:** `@endpoint GET /api/doctor/email_today_schedule`
- **File Locations:** [`OptiDent_NodeJS/api/doctor/index.js#L1015`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/doctor/index.js#L1015) | [`OptiDent_System_Final/api/doctor/index.js#L1016`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/doctor/index.js#L1016)

#### `GET http://localhost:3000/api/doctor/weekly_traffic`
- **Description:** Fetches weekly appointment traffic statistics for doctor operatory
- **Search in Code:** `@endpoint GET /api/doctor/weekly_traffic`
- **File Locations:** [`OptiDent_System_Final/api/doctor/index.js#L1020`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/doctor/index.js#L1020)

---

## 4.0 RECEPTIONIST & CHAIRSIDE QUEUE MODULE

### Module Description
This module supports clinic front-desk operations. It handles walk-in patient intake, phone bookings, real-time chairside waiting queue reordering, contactless QR pass scanning, master patient directory searches, and live doctor slot availability computations.

**Source Files:**  
- `OptiDent_NodeJS`: [`api/receptionist/index.js`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/receptionist/index.js)  
- `OptiDent_System_Final`: [`api/receptionist/index.js`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/receptionist/index.js)  

### Endpoints & Code Search Reference

#### `GET http://localhost:3000/api/receptionist/get_dashboard_data`
- **Description:** Returns live overview of today's appointments, queue order, and arriving patients
- **Search in Code:** `@endpoint GET /api/receptionist/get_dashboard_data`
- **File Locations:** [`OptiDent_NodeJS/api/receptionist/index.js#L22`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/receptionist/index.js#L22) | [`OptiDent_System_Final/api/receptionist/index.js#L24`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/receptionist/index.js#L24)

#### `POST http://localhost:3000/api/receptionist/create_appointment`
- **Description:** Books an appointment for walk-in or phone-in patients with doctor and procedure
- **Search in Code:** `@endpoint POST /api/receptionist/create_appointment`
- **File Locations:** [`OptiDent_NodeJS/api/receptionist/index.js#L181`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/receptionist/index.js#L181) | [`OptiDent_System_Final/api/receptionist/index.js#L183`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/receptionist/index.js#L183)

#### `POST http://localhost:3000/api/receptionist/delete_appointment`
- **Description:** Soft-deletes an appointment record (moves to Recovery Vault)
- **Search in Code:** `@endpoint POST /api/receptionist/delete_appointment`
- **File Locations:** [`OptiDent_NodeJS/api/receptionist/index.js#L252`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/receptionist/index.js#L252) | [`OptiDent_System_Final/api/receptionist/index.js#L254`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/receptionist/index.js#L254)

#### `POST http://localhost:3000/api/receptionist/reschedule_appointment`
- **Description:** Reschedules an appointment to a new date/time and syncs to Google Calendar
- **Search in Code:** `@endpoint POST /api/receptionist/reschedule_appointment`
- **File Locations:** [`OptiDent_NodeJS/api/receptionist/index.js#L296`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/receptionist/index.js#L296) | [`OptiDent_System_Final/api/receptionist/index.js#L298`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/receptionist/index.js#L298)

#### `POST http://localhost:3000/api/receptionist/cancel_appointment`
- **Description:** Cancels an appointment and updates queue roster
- **Search in Code:** `@endpoint POST /api/receptionist/cancel_appointment`
- **File Locations:** [`OptiDent_NodeJS/api/receptionist/index.js#L350`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/receptionist/index.js#L350) | [`OptiDent_System_Final/api/receptionist/index.js#L352`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/receptionist/index.js#L352)

#### `POST http://localhost:3000/api/receptionist/update_appointment_status`
- **Description:** Updates patient queue status (arrived, seated, in_progress, completed)
- **Search in Code:** `@endpoint POST /api/receptionist/update_appointment_status`
- **File Locations:** [`OptiDent_NodeJS/api/receptionist/index.js#L387`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/receptionist/index.js#L387) | [`OptiDent_System_Final/api/receptionist/index.js#L389`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/receptionist/index.js#L389)

#### `POST http://localhost:3000/api/receptionist/register_patient`
- **Description:** Creates a new patient profile at reception desk for walk-in clients
- **Search in Code:** `@endpoint POST /api/receptionist/register_patient`
- **File Locations:** [`OptiDent_NodeJS/api/receptionist/index.js#L418`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/receptionist/index.js#L418) | [`OptiDent_System_Final/api/receptionist/index.js#L420`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/receptionist/index.js#L420)

#### `POST http://localhost:3000/api/receptionist/update_profile`
- **Description:** Updates receptionist personal details and contact information
- **Search in Code:** `@endpoint POST /api/receptionist/update_profile`
- **File Locations:** [`OptiDent_NodeJS/api/receptionist/index.js#L465`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/receptionist/index.js#L465) | [`OptiDent_System_Final/api/receptionist/index.js#L467`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/receptionist/index.js#L467)

#### `POST http://localhost:3000/api/receptionist/change_password`
- **Description:** Updates receptionist account password
- **Search in Code:** `@endpoint POST /api/receptionist/change_password`
- **File Locations:** [`OptiDent_NodeJS/api/receptionist/index.js#L508`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/receptionist/index.js#L508) | [`OptiDent_System_Final/api/receptionist/index.js#L510`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/receptionist/index.js#L510)

#### `GET http://localhost:3000/api/receptionist/search_patients`
- **Description:** Fast directory search across patient names, contact numbers, and emails
- **Search in Code:** `@endpoint GET /api/receptionist/search_patients`
- **File Locations:** [`OptiDent_NodeJS/api/receptionist/index.js#L553`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/receptionist/index.js#L553) | [`OptiDent_System_Final/api/receptionist/index.js#L555`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/receptionist/index.js#L555)

#### `GET http://localhost:3000/api/receptionist/get_doctor_schedule_slots`
- **Description:** Computes open chairside time slots for any doctor on a requested date
- **Search in Code:** `@endpoint GET /api/receptionist/get_doctor_schedule_slots`
- **File Locations:** [`OptiDent_NodeJS/api/receptionist/index.js#L707`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/receptionist/index.js#L707) | [`OptiDent_System_Final/api/receptionist/index.js#L709`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/receptionist/index.js#L709)

#### `GET http://localhost:3000/api/receptionist/get_patient_details`
- **Description:** Fetches complete demographic and treatment dossier for a selected patient
- **Search in Code:** `@endpoint GET /api/receptionist/get_patient_details`
- **File Locations:** [`OptiDent_NodeJS/api/receptionist/index.js#L857`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/receptionist/index.js#L857) | [`OptiDent_System_Final/api/receptionist/index.js#L859`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/receptionist/index.js#L859)

#### `POST http://localhost:3000/api/receptionist/checkin_returning_patient`
- **Description:** Processes QR pass scan or marks arrival to advance to waiting queue
- **Search in Code:** `@endpoint POST /api/receptionist/checkin_returning_patient`
- **File Locations:** [`OptiDent_NodeJS/api/receptionist/index.js#L919`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/receptionist/index.js#L919) | [`OptiDent_System_Final/api/receptionist/index.js#L921`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/receptionist/index.js#L921)

#### `POST http://localhost:3000/api/receptionist/update_patient`
- **Description:** Updates patient personal and contact data
- **Search in Code:** `@endpoint POST /api/receptionist/update_patient`
- **File Locations:** [`OptiDent_NodeJS/api/receptionist/index.js#L980`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/receptionist/index.js#L980) | [`OptiDent_System_Final/api/receptionist/index.js#L982`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/receptionist/index.js#L982)

#### `POST http://localhost:3000/api/receptionist/update_appointment`
- **Description:** Modifies appointment timing, notes, procedure type, or dentist assignment
- **Search in Code:** `@endpoint POST /api/receptionist/update_appointment`
- **File Locations:** [`OptiDent_NodeJS/api/receptionist/index.js#L1015`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/receptionist/index.js#L1015) | [`OptiDent_System_Final/api/receptionist/index.js#L1017`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/receptionist/index.js#L1017)

#### `POST http://localhost:3000/api/receptionist/reorder_queue`
- **Description:** Enables drag-and-drop chairside queue priority adjustments
- **Search in Code:** `@endpoint POST /api/receptionist/reorder_queue`
- **File Locations:** [`OptiDent_NodeJS/api/receptionist/index.js#L1080`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/receptionist/index.js#L1080) | [`OptiDent_System_Final/api/receptionist/index.js#L1082`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/receptionist/index.js#L1082)

#### `GET http://localhost:3000/api/receptionist/get_reports_data`
- **Description:** Retrieves daily reception summaries, patient counts, and queue statistics
- **Search in Code:** `@endpoint GET /api/receptionist/get_reports_data`
- **File Locations:** [`OptiDent_NodeJS/api/receptionist/index.js#L1101`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/receptionist/index.js#L1101) | [`OptiDent_System_Final/api/receptionist/index.js#L1103`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/receptionist/index.js#L1103)

#### `GET http://localhost:3000/api/receptionist/weekly_traffic`
- **Description:** Fetches weekly appointment traffic analytics for reception desk
- **Search in Code:** `@endpoint GET /api/receptionist/weekly_traffic`
- **File Locations:** [`OptiDent_System_Final/api/receptionist/index.js#L1380`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/receptionist/index.js#L1380)

#### `POST http://localhost:3000/api/receptionist/verify_qr`
- **Description:** Cryptographically validates patient check-in QR code token
- **Search in Code:** `@endpoint POST /api/receptionist/verify_qr`
- **File Locations:** [`OptiDent_System_Final/api/receptionist/index.js#L1394`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/receptionist/index.js#L1394)

---

## 5.0 SUPER ADMINISTRATOR & SYSTEM GOVERNANCE MODULE

### Module Description
This module provides enterprise-level governance for root Super Administrators. It manages user accounts, role permission assignments (RBAC Matrix SA-004), clinic working hours & shifts, third-party API gateway circuit breakers (SA-008), Google Calendar live two-way sync, Data Recovery Vault (SA-006), Historical Cold-Storage Archives (SA-007), immutable audit logging, and financial analytics exports.

**Source Files:**  
- `OptiDent_NodeJS`: [`api/admin/index.js`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/admin/index.js)  
- `OptiDent_System_Final`: [`api/admin/index.js`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/admin/index.js)  

### Endpoints & Code Search Reference

#### `GET http://localhost:3000/api/admin/get_users`
- **Description:** Queries master user list with search, role filters, and pagination
- **Search in Code:** `@endpoint GET /api/admin/get_users`
- **File Locations:** [`OptiDent_NodeJS/api/admin/index.js#L23`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/admin/index.js#L23) | [`OptiDent_System_Final/api/admin/index.js#L24`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/admin/index.js#L24)

#### `POST http://localhost:3000/api/admin/create_user`
- **Description:** Direct administrative creation of staff and patient accounts
- **Search in Code:** `@endpoint POST /api/admin/create_user`
- **File Locations:** [`OptiDent_NodeJS/api/admin/index.js#L82`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/admin/index.js#L82) | [`OptiDent_System_Final/api/admin/index.js#L83`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/admin/index.js#L83)

#### `POST http://localhost:3000/api/admin/update_user`
- **Description:** Updates user credentials, role assignment, and contact details
- **Search in Code:** `@endpoint POST /api/admin/update_user`
- **File Locations:** [`OptiDent_NodeJS/api/admin/index.js#L148`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/admin/index.js#L148) | [`OptiDent_System_Final/api/admin/index.js#L149`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/admin/index.js#L149)

#### `POST http://localhost:3000/api/admin/delete_user`
- **Description:** Soft-deletes a user account (preserves record in Recovery Vault)
- **Search in Code:** `@endpoint POST /api/admin/delete_user`
- **File Locations:** [`OptiDent_NodeJS/api/admin/index.js#L184`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/admin/index.js#L184) | [`OptiDent_System_Final/api/admin/index.js#L185`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/admin/index.js#L185)

#### `POST http://localhost:3000/api/admin/toggle_user_status`
- **Description:** Toggles account access between Active and Suspended
- **Search in Code:** `@endpoint POST /api/admin/toggle_user_status`
- **File Locations:** [`OptiDent_NodeJS/api/admin/index.js#L218`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/admin/index.js#L218) | [`OptiDent_System_Final/api/admin/index.js#L219`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/admin/index.js#L219)

#### `GET http://localhost:3000/api/admin/get_rbac_matrix`
- **Description:** Returns full permission matrix mapping granular actions to system roles
- **Search in Code:** `@endpoint GET /api/admin/get_rbac_matrix`
- **File Locations:** [`OptiDent_NodeJS/api/admin/index.js#L243`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/admin/index.js#L243) | [`OptiDent_System_Final/api/admin/index.js#L244`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/admin/index.js#L244)

#### `POST http://localhost:3000/api/admin/update_role_permissions`
- **Description:** Updates permission grants across Doctor, Receptionist, or Patient roles
- **Search in Code:** `@endpoint POST /api/admin/update_role_permissions`
- **File Locations:** [`OptiDent_NodeJS/api/admin/index.js#L350`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/admin/index.js#L350) | [`OptiDent_System_Final/api/admin/index.js#L351`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/admin/index.js#L351)

#### `GET http://localhost:3000/api/admin/get_audit_logs`
- **Description:** Retrieves immutable system audit trail with timestamps, IP addresses, and user
- **Search in Code:** `@endpoint GET /api/admin/get_audit_logs`
- **File Locations:** [`OptiDent_NodeJS/api/admin/index.js#L418`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/admin/index.js#L418) | [`OptiDent_System_Final/api/admin/index.js#L419`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/admin/index.js#L419)

#### `GET http://localhost:3000/api/admin/get_system_settings`
- **Description:** Retrieves clinic operating profile, working days, shifts, and active gateways
- **Search in Code:** `@endpoint GET /api/admin/get_system_settings`
- **File Locations:** [`OptiDent_NodeJS/api/admin/index.js#L462`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/admin/index.js#L462) | [`OptiDent_System_Final/api/admin/index.js#L463`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/admin/index.js#L463)

#### `POST http://localhost:3000/api/admin/update_system_settings`
- **Description:** Persists changes to clinic schedule parameters, duty days, and rules
- **Search in Code:** `@endpoint POST /api/admin/update_system_settings`
- **File Locations:** [`OptiDent_NodeJS/api/admin/index.js#L512`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/admin/index.js#L512) | [`OptiDent_System_Final/api/admin/index.js#L513`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/admin/index.js#L513)

#### `POST http://localhost:3000/api/admin/toggle_integration`
- **Description:** Circuit breaker toggling Google Auth, SMTP, Calendar, and reCAPTCHA
- **Search in Code:** `@endpoint POST /api/admin/toggle_integration`
- **File Locations:** [`OptiDent_NodeJS/api/admin/index.js#L556`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/admin/index.js#L556) | [`OptiDent_System_Final/api/admin/index.js#L557`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/admin/index.js#L557)

#### `GET http://localhost:3000/api/admin/get_default_service_account`
- **Description:** Fetches current service account identity for Google Cloud integration
- **Search in Code:** `@endpoint GET /api/admin/get_default_service_account`
- **File Locations:** [`OptiDent_NodeJS/api/admin/index.js#L650`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/admin/index.js#L650) | [`OptiDent_System_Final/api/admin/index.js#L651`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/admin/index.js#L651)

#### `GET http://localhost:3000/api/admin/get_google_calendar_status`
- **Description:** Validates live connectivity to Google Calendar API v3 and sync state
- **Search in Code:** `@endpoint GET /api/admin/get_google_calendar_status`
- **File Locations:** [`OptiDent_NodeJS/api/admin/index.js#L670`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/admin/index.js#L670) | [`OptiDent_System_Final/api/admin/index.js#L671`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/admin/index.js#L671)

#### `POST http://localhost:3000/api/admin/sync_google_calendar`
- **Description:** Queues bi-directional synchronization between MongoDB and Google Calendar
- **Search in Code:** `@endpoint POST /api/admin/sync_google_calendar`
- **File Locations:** [`OptiDent_NodeJS/api/admin/index.js#L789`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/admin/index.js#L789) | [`OptiDent_System_Final/api/admin/index.js#L790`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/admin/index.js#L790)

#### `POST http://localhost:3000/api/admin/sync_google_calendar_now`
- **Description:** Forces immediate live two-way synchronization of appointment blocks
- **Search in Code:** `@endpoint POST /api/admin/sync_google_calendar_now`
- **File Locations:** [`OptiDent_NodeJS/api/admin/index.js#L791`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/admin/index.js#L791) | [`OptiDent_System_Final/api/admin/index.js#L792`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/admin/index.js#L792)

#### `GET http://localhost:3000/api/admin/google_calendar_feed`
- **Description:** Queries live calendar event stream directly from Google Workspace
- **Search in Code:** `@endpoint GET /api/admin/google_calendar_feed`
- **File Locations:** [`OptiDent_NodeJS/api/admin/index.js#L797`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/admin/index.js#L797) | [`OptiDent_System_Final/api/admin/index.js#L798`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/admin/index.js#L798)

#### `GET http://localhost:3000/api/admin/get_deleted_records`
- **Description:** Inspects soft-deleted users, appointments, and treatments in Recovery Vault
- **Search in Code:** `@endpoint GET /api/admin/get_deleted_records`
- **File Locations:** [`OptiDent_NodeJS/api/admin/index.js#L872`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/admin/index.js#L872) | [`OptiDent_System_Final/api/admin/index.js#L873`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/admin/index.js#L873)

#### `POST http://localhost:3000/api/admin/restore_record`
- **Description:** Restores a soft-deleted item back to active database collections
- **Search in Code:** `@endpoint POST /api/admin/restore_record`
- **File Locations:** [`OptiDent_NodeJS/api/admin/index.js#L959`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/admin/index.js#L959) | [`OptiDent_System_Final/api/admin/index.js#L960`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/admin/index.js#L960)

#### `GET http://localhost:3000/api/admin/get_archived_records`
- **Description:** Searches historical cold-storage archives for past appointments
- **Search in Code:** `@endpoint GET /api/admin/get_archived_records`
- **File Locations:** [`OptiDent_NodeJS/api/admin/index.js#L996`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/admin/index.js#L996) | [`OptiDent_System_Final/api/admin/index.js#L997`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/admin/index.js#L997)

#### `POST http://localhost:3000/api/admin/archive_record`
- **Description:** Transfers completed or closed record into cold-storage archive
- **Search in Code:** `@endpoint POST /api/admin/archive_record`
- **File Locations:** [`OptiDent_NodeJS/api/admin/index.js#L1006`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/admin/index.js#L1006) | [`OptiDent_System_Final/api/admin/index.js#L1007`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/admin/index.js#L1007)

#### `POST http://localhost:3000/api/admin/unarchive_record`
- **Description:** Returns an archived record back to active collections
- **Search in Code:** `@endpoint POST /api/admin/unarchive_record`
- **File Locations:** [`OptiDent_NodeJS/api/admin/index.js#L1019`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/admin/index.js#L1019) | [`OptiDent_System_Final/api/admin/index.js#L1020`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/admin/index.js#L1020)

#### `GET http://localhost:3000/api/admin/get_reports_data`
- **Description:** Aggregates clinic revenue, appointment volume, procedure distribution, and doctor performance
- **Search in Code:** `@endpoint GET /api/admin/get_reports_data`
- **File Locations:** [`OptiDent_NodeJS/api/admin/index.js#L1035`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/admin/index.js#L1035) | [`OptiDent_System_Final/api/admin/index.js#L1047`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/admin/index.js#L1047)

#### `GET http://localhost:3000/api/admin/export_csv`
- **Description:** Exports clinic earnings, patient directory, or appointments to CSV format
- **Search in Code:** `@endpoint GET /api/admin/export_csv`
- **File Locations:** [`OptiDent_NodeJS/api/admin/index.js#L1256`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/admin/index.js#L1256) | [`OptiDent_System_Final/api/admin/index.js#L1268`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/admin/index.js#L1268)

#### `GET http://localhost:3000/api/admin/export_pdf`
- **Description:** Generates printable executive summary report
- **Search in Code:** `@endpoint GET /api/admin/export_pdf`
- **File Locations:** [`OptiDent_NodeJS/api/admin/index.js#L1481`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/admin/index.js#L1481)

#### `GET http://localhost:3000/api/admin/get_invitations`
- **Description:** Lists pending, accepted, and expired staff invitation tokens
- **Search in Code:** `@endpoint GET /api/admin/get_invitations`
- **File Locations:** [`OptiDent_NodeJS/api/admin/index.js#L1688`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/admin/index.js#L1688) | [`OptiDent_System_Final/api/admin/index.js#L1494`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/admin/index.js#L1494)

#### `POST http://localhost:3000/api/admin/invite_user`
- **Description:** Issues signed cryptographic onboarding invite email to new Doctor or Staff
- **Search in Code:** `@endpoint POST /api/admin/invite_user`
- **File Locations:** [`OptiDent_NodeJS/api/admin/index.js#L1718`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/admin/index.js#L1718) | [`OptiDent_System_Final/api/admin/index.js#L1524`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/admin/index.js#L1524)

#### `POST http://localhost:3000/api/admin/cancel_invite`
- **Description:** Revokes an unaccepted onboarding invitation link
- **Search in Code:** `@endpoint POST /api/admin/cancel_invite`
- **File Locations:** [`OptiDent_NodeJS/api/admin/index.js#L1814`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/admin/index.js#L1814) | [`OptiDent_System_Final/api/admin/index.js#L1620`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/admin/index.js#L1620)

#### `POST http://localhost:3000/api/admin/resend_invite`
- **Description:** Refreshes and resends an onboarding invite email
- **Search in Code:** `@endpoint POST /api/admin/resend_invite`
- **File Locations:** [`OptiDent_NodeJS/api/admin/index.js#L1856`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/admin/index.js#L1856) | [`OptiDent_System_Final/api/admin/index.js#L1662`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/admin/index.js#L1662)

#### `GET http://localhost:3000/api/admin/get_system_data_stats`
- **Description:** Returns database health, collection counts, and memory storage metrics
- **Search in Code:** `@endpoint GET /api/admin/get_system_data_stats`
- **File Locations:** [`OptiDent_NodeJS/api/admin/index.js#L1904`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/admin/index.js#L1904) | [`OptiDent_System_Final/api/admin/index.js#L1710`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/admin/index.js#L1710)

#### `POST http://localhost:3000/api/admin/assign_user_role`
- **Description:** Reassigns an existing user to a different system role
- **Search in Code:** `@endpoint POST /api/admin/assign_user_role`
- **File Locations:** [`OptiDent_NodeJS/api/admin/index.js#L1943`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/admin/index.js#L1943) | [`OptiDent_System_Final/api/admin/index.js#L1749`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/admin/index.js#L1749)

#### `POST http://localhost:3000/api/admin/purge_record`
- **Description:** Permanently and irreversibly purges a soft-deleted record
- **Search in Code:** `@endpoint POST /api/admin/purge_record`
- **File Locations:** [`OptiDent_NodeJS/api/admin/index.js#L1978`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/admin/index.js#L1978) | [`OptiDent_System_Final/api/admin/index.js#L1784`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/admin/index.js#L1784)

#### `POST http://localhost:3000/api/admin/batch_archive`
- **Description:** Performs bulk archiving on completed records past specified age
- **Search in Code:** `@endpoint POST /api/admin/batch_archive`
- **File Locations:** [`OptiDent_NodeJS/api/admin/index.js#L2007`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/admin/index.js#L2007) | [`OptiDent_System_Final/api/admin/index.js#L1813`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/admin/index.js#L1813)

#### `GET http://localhost:3000/api/admin/get_email_config`
- **Description:** Checks current SMTP mailer dispatch configuration
- **Search in Code:** `@endpoint GET /api/admin/get_email_config`
- **File Locations:** [`OptiDent_NodeJS/api/admin/index.js#L2111`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/admin/index.js#L2111) | [`OptiDent_System_Final/api/admin/index.js#L1917`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/admin/index.js#L1917)

#### `POST http://localhost:3000/api/admin/save_email_config`
- **Description:** Updates clinic SMTP relay host, port, user, and password credentials
- **Search in Code:** `@endpoint POST /api/admin/save_email_config`
- **File Locations:** [`OptiDent_NodeJS/api/admin/index.js#L2132`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/admin/index.js#L2132) | [`OptiDent_System_Final/api/admin/index.js#L1938`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/admin/index.js#L1938)

#### `GET http://localhost:3000/api/admin/get_clinical_records`
- **Description:** Super Admin review of patient treatment histories
- **Search in Code:** `@endpoint GET /api/admin/get_clinical_records`
- **File Locations:** [`OptiDent_NodeJS/api/admin/index.js#L2164`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/admin/index.js#L2164) | [`OptiDent_System_Final/api/admin/index.js#L1970`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/admin/index.js#L1970)

#### `POST http://localhost:3000/api/admin/save_clinical_record`
- **Description:** Administrative record override or corrections
- **Search in Code:** `@endpoint POST /api/admin/save_clinical_record`
- **File Locations:** [`OptiDent_NodeJS/api/admin/index.js#L2241`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/api/admin/index.js#L2241) | [`OptiDent_System_Final/api/admin/index.js#L2047`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/admin/index.js#L2047)

#### `GET http://localhost:3000/api/admin/weekly_traffic`
- **Description:** Aggregates weekly patient visits and booking traffic metrics
- **Search in Code:** `@endpoint GET /api/admin/weekly_traffic`
- **File Locations:** [`OptiDent_System_Final/api/admin/index.js#L1034`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/admin/index.js#L1034)

---

## 6.0 SYSTEM HEALTH & DIAGNOSTICS MODULE

### Module Description
This module exposes core server runtime health, database connection probes, and report rendering utilities.

**Source Files:**  
- `OptiDent_NodeJS`: [`server.js`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/server.js)  
- `OptiDent_System_Final`: [`server.js`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/server.js)  

### Endpoints & Code Search Reference

#### `GET http://localhost:3000/api/health`
- **Description:** Server health probe returning uptime, memory, environment, and MongoDB connection status
- **Search in Code:** `@endpoint GET /api/health`
- **File Locations:** [`OptiDent_NodeJS/server.js#L71`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/server.js#L71) | [`OptiDent_System_Final/server.js#L75`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/server.js#L75)

#### `GET http://localhost:3000`
- **Description:** Root web entrance rendering the main clinic application portal
- **Search in Code:** `@endpoint GET /`
- **File Locations:** [`OptiDent_NodeJS/server.js#L90`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_NodeJS/server.js#L90) | [`OptiDent_System_Final/server.js#L94`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/server.js#L94)

---

## 7.0 REPORTS & PDF EXPORT ENGINE MODULE

### Module Description
This module provides enterprise PDF rendering services using PDFShift cloud integration with a resilient built-in HTML-to-PDF fallback renderer.

**Source Files:**  
- `OptiDent_System_Final`: [`api/reports/index.js`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/reports/index.js)  

### Endpoints & Code Search Reference

#### `POST http://localhost:3000/api/reports/pdf`
- **Description:** Generates official branded PDF reports with PDFShift or built-in fallback engine
- **Search in Code:** `@endpoint POST /api/reports/pdf`
- **File Locations:** [`OptiDent_System_Final/api/reports/index.js#L21`](file:///c:/Users/User/Documents/SIA/OptiDent_System/OptiDent_System_Final/api/reports/index.js#L21)

---

## 7.0 Summary by HTTP Method

| HTTP Method | Count | Primary Operational Scope |
|---|---|---|
| **GET** | 43 | Data retrieval, dashboards, doctor slots, reports, audit logs, health probes |
| **POST** | 65 | Account mutations, appointment scheduling, queue management, status changes |
| **Total** | **108** | **Full OptiDent System API Coverage** |
