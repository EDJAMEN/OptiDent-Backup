# 🦷 OptiDent Dental Clinic Management System

> A full-stack dental clinic management system built with **PHP 8.3**, **MongoDB**, and **vanilla HTML/CSS/JS**.

---

## 📋 Table of Contents

- [Prerequisites](#-prerequisites)
- [Quick Start (2 Commands)](#-quick-start-2-commands)
- [Step-by-Step Setup Guide](#-step-by-step-setup-guide)
- [Accessing the System](#-accessing-the-system)
- [Accessing MongoDB Database](#-accessing-mongodb-database)
- [Project Structure](#-project-structure)
- [User Roles & Default Accounts](#-user-roles--default-accounts)
- [Troubleshooting](#-troubleshooting)

---

## 🔧 Prerequisites

Make sure the following are installed on your Windows machine:

| Software | Version | Download |
|----------|---------|----------|
| **PHP** | 8.3+ | `winget install PHP.PHP.8.3` |
| **MongoDB Server** | 8.x | [mongodb.com/try/download](https://www.mongodb.com/try/download/community) |
| **MongoDB Compass** *(optional, GUI)* | Latest | [mongodb.com/products/compass](https://www.mongodb.com/products/compass) |

### Required PHP Extensions

These extensions must be enabled in `php.ini` (already configured in this project):

- `openssl` — Gmail SMTP for OTP verification
- `curl` — API requests
- `mbstring` — String handling
- `mongodb` — Native MongoDB C driver (fast, sub-millisecond queries)

> ⚠️ If `php_mongodb.dll` is missing from your PHP `ext/` folder, download it from:
> [windows.php.net/downloads/pecl/releases/mongodb](https://windows.php.net/downloads/pecl/releases/mongodb/)
> Choose the file matching: `php_mongodb-x.x.x-8.3-ts-vs16-x64.zip`
> Extract `php_mongodb.dll` and place it in your PHP `ext/` directory.

---

## 🚀 Quick Start (2 Commands)

Open **two separate CMD/Terminal windows**, both in the project folder:

```
cd c:\Users\User\Documents\SIA\OptiDent_System\OptiDentImplementation
```

### Terminal 1 — Start MongoDB

```cmd
start_mongodb.bat
```

Or manually (if MongoDB is not installed as a Windows Service):

```cmd
run_mongodb_local.bat
```

### Terminal 2 — Start PHP Server

```cmd
php -c php.ini -S 127.0.0.1:8080
```

### Open in Browser

```
http://127.0.0.1:8080/index.html
```

That's it! 🎉

---

## 📖 Step-by-Step Setup Guide

### Step 1: Start MongoDB

**Option A — Windows Service (Recommended)**

If MongoDB is installed as a Windows Service, run:

```cmd
start_mongodb.bat
```

This will request admin privileges and start the `MongoDB` service via `net start MongoDB`.

**Option B — Manual Start (Standalone)**

If MongoDB is NOT a Windows Service, run:

```cmd
run_mongodb_local.bat
```

This starts `mongod.exe` directly, storing data in:
```
c:\Users\User\Documents\SIA\OptiDent_System\mongodb_data\
```

> ℹ️ Keep this terminal open — closing it stops MongoDB.

### Step 2: Start the PHP Development Server

Open a **new terminal** in the project directory and run:

```cmd
php -c php.ini -S 127.0.0.1:8080
```

| Flag | Purpose |
|------|---------|
| `-c php.ini` | Uses the project's custom `php.ini` with all required extensions enabled |
| `-S 127.0.0.1:8080` | Starts PHP's built-in web server on port 8080 |

> ⚠️ The `-c php.ini` flag is **critical**. Without it, the `mongodb`, `openssl`, and `curl` extensions won't load, causing slow performance or errors.

### Step 3: Open in Browser

Navigate to:

```
http://127.0.0.1:8080/index.html
```

---

## 🌐 Accessing the System

### Main Pages

| Page | URL |
|------|-----|
| **Login / Register** | `http://127.0.0.1:8080/index.html` |
| **Patient Registration** | `http://127.0.0.1:8080/index.html#register` |
| **Accept Staff Invite** | `http://127.0.0.1:8080/accept_invite.html?token=<TOKEN>` |

### Dashboards (requires login)

After logging in through `index.html`, you will be automatically redirected to the appropriate dashboard based on your role:

| Role | Dashboard URL |
|------|---------------|
| Super Admin / Admin | `http://127.0.0.1:8080/admin_dashboard.html` |
| Doctor | `http://127.0.0.1:8080/doctor_dashboard.html` |
| Receptionist / Staff | `http://127.0.0.1:8080/receptionist_dashboard.html` |
| Patient / Client | `http://127.0.0.1:8080/client_dashboard.html` |

---

## 🗄️ Accessing MongoDB Database

### Connection Details

| Property | Value |
|----------|-------|
| **Host** | `127.0.0.1` (localhost) |
| **Port** | `27017` |
| **Database Name** | `OptiDent` |
| **Connection URI** | `mongodb://127.0.0.1:27017` |

### Using MongoDB Compass (GUI — Recommended)

1. Open **MongoDB Compass**
2. In the connection string field, enter:
   ```
   mongodb://127.0.0.1:27017
   ```
3. Click **Connect**
4. Select the **`OptiDent`** database from the sidebar
5. Browse collections like `users`, `appointments`, `clinical_records`, etc.

### Using mongosh (Command Line)

```cmd
mongosh "mongodb://127.0.0.1:27017/OptiDent"
```

Common queries:

```javascript
// List all collections
show collections

// View all users
db.users.find().pretty()

// View all appointments
db.appointments.find().pretty()

// Find a specific user by email
db.users.findOne({ email: "admin@optident.com" })

// Count patients
db.users.countDocuments({ role: "patient" })

// View clinical records
db.clinical_records.find().pretty()

// View email verifications (OTP records)
db.email_verifications.find().pretty()
```

### Key Collections

| Collection | Description |
|------------|-------------|
| `users` | All user accounts (admins, doctors, receptionists, patients) |
| `appointments` | Booked dental appointments |
| `clinical_records` | Patient dental records and treatment history |
| `email_verifications` | OTP codes sent for Gmail verification |
| `invite_links` | Staff invitation tokens |
| `activity_logs` | System audit trail |

---

## 📁 Project Structure

```
OptiDentImplementation/
├── index.html                    # Login & Patient Registration page
├── admin_dashboard.html          # Super Admin / Admin dashboard
├── doctor_dashboard.html         # Doctor dashboard
├── receptionist_dashboard.html   # Receptionist / Staff dashboard
├── client_dashboard.html         # Patient dashboard
├── accept_invite.html            # Staff invite acceptance page
│
├── api/                          # Backend PHP API
│   ├── config/
│   │   └── db.php                # MongoDB connection manager
│   ├── auth/                     # Authentication endpoints
│   │   ├── login.php             # User login
│   │   ├── logout.php            # User logout
│   │   ├── me.php                # Session check
│   │   ├── send_patient_code.php # Gmail OTP sender
│   │   └── client_register_step1.php  # Patient registration (Step 1)
│   ├── admin/                    # Admin API endpoints
│   ├── doctor/                   # Doctor API endpoints
│   ├── receptionist/             # Receptionist API endpoints
│   └── client/                   # Client/Patient API endpoints
│       └── complete_profile.php  # Patient registration (Step 2)
│
├── css/                          # Stylesheets
├── assets/                       # Static assets (images, icons)
│
├── php.ini                       # Custom PHP config (extensions enabled)
├── start_mongodb.bat             # Start MongoDB as Windows Service
├── run_mongodb_local.bat         # Start MongoDB manually (standalone)
└── README.md                     # This file
```

---

## 👥 User Roles & Default Accounts

The system supports the following roles:

| Role | Access Level | How to Create |
|------|-------------|---------------|
| **Super Admin** | Full system control, manage all users | Seeded in database |
| **Admin** | Manage staff, patients, appointments | Invited by Super Admin |
| **Doctor** | View patients, manage clinical records | Invited by Admin/Super Admin |
| **Receptionist** | Front desk, booking, patient check-in | Invited by Admin/Super Admin |
| **Patient** | Book appointments, view own records | Self-register via `index.html#register` |

### Patient Registration Flow

1. Go to `http://127.0.0.1:8080/index.html#register`
2. Fill in: Full Name, Gmail, Password
3. Click **"Send Verification Code & Continue"**
4. Enter the **6-digit OTP** sent to your Gmail
5. Complete your **Personal Information** and **Clinical Safety** details
6. You're registered! 🎉

### Staff Onboarding Flow

1. Super Admin / Admin creates an invite from the dashboard
2. Staff member receives an invite link via email
3. Staff opens `accept_invite.html?token=<TOKEN>`
4. Sets their password and activates their account

---

## 🔥 Troubleshooting

### "MongoDB connection failed" or slow page loads

**Cause:** MongoDB is not running.

**Fix:**
```cmd
start_mongodb.bat
```
Or:
```cmd
run_mongodb_local.bat
```

---

### Pages load very slowly (2-5 seconds per click)

**Cause:** The `php_mongodb.dll` extension is missing, so queries fall back to spawning `mongosh` subprocesses.

**Fix:**
1. Download `php_mongodb.dll` from [windows.php.net/downloads/pecl/releases/mongodb](https://windows.php.net/downloads/pecl/releases/mongodb/)
2. Choose: `php_mongodb-x.x.x-8.3-ts-vs16-x64.zip`
3. Extract `php_mongodb.dll` into your PHP `ext/` folder
4. Ensure `extension=mongodb` is in `php.ini`
5. Restart the PHP server

**Verify it's loaded:**
```cmd
php -c php.ini -r "echo extension_loaded('mongodb') ? 'OK' : 'MISSING';"
```

---

### "mongod is not recognized" error

**Cause:** MongoDB `bin/` folder is not in your system PATH.

**Fix:** Use the batch files instead:
```cmd
start_mongodb.bat        # If installed as a service
run_mongodb_local.bat    # If standalone
```

---

### OTP email not sending

**Cause:** Gmail SMTP credentials may need updating or "App Passwords" not configured.

**Fix:**
1. Go to your Google Account → Security → 2-Step Verification → App Passwords
2. Generate a new app password for "Mail"
3. Update the SMTP credentials in `api/auth/send_patient_code.php`

---

### Port 8080 already in use

**Fix:** Use a different port:
```cmd
php -c php.ini -S 127.0.0.1:9090
```
Then access via `http://127.0.0.1:9090/index.html`

---

## 📝 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | HTML5, CSS3, Vanilla JavaScript |
| **Backend** | PHP 8.3 (built-in server) |
| **Database** | MongoDB 8.x (local) |
| **PHP MongoDB Driver** | ext-mongodb (native C driver) |
| **Email** | Gmail SMTP via PHPMailer |
| **Icons** | Boxicons |
| **Fonts** | Google Fonts (Outfit, Inter) |
