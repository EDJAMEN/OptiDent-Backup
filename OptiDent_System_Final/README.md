# OptiDent Dental Clinic Management System
## Fullstack JavaScript (Node.js + Express + MongoDB)

### Overview
OptiDent is a comprehensive dental practice management solution built with modern **ES Modules (ECMAScript 6+)**, **Node.js**, **Express**, and **MongoDB**.

The application features:
- **100% Identical UI/UX & Interactive Design**: All patient dashboards, receptionist queue monitors, doctor clinical charting (with live odontogram & tooth surfaces), and super-admin RBAC matrices.
- **Pure JavaScript Backend (Modular `api/` Structure)**: Directly mirrors your familiar API folder structure (`api/auth`, `api/client`, `api/doctor`, `api/receptionist`, `api/admin`).
- **Native MongoDB Database**: Direct connection to MongoDB on `mongodb://127.0.0.1:27017` with seamless JSON fallback support.

---

### Project Structure
```
OptiDent_NodeJS/
├── server.js                 # Central Express server & static asset host
├── package.json              # Configured with "type": "module"
├── start_server.bat          # 1-Click launcher for Windows
├── start_mongodb.bat         # 1-Click launcher for MongoDB service
├── .env                      # Environment configuration (Port, Mongo URI, Secrets)
├── README.md                 # Project documentation
│
├── public/                   # Frontend UI/UX (Identical HTML, CSS, & Assets)
│   ├── index.html            # Unified landing & login portal
│   ├── client_dashboard.html # Patient self-service portal
│   ├── receptionist_dashboard.html # Front-desk queue & schedule management
│   ├── doctor_dashboard.html # Doctor clinical workspace & diagnosis
│   ├── admin_dashboard.html  # Super Admin RBAC & audit security
│   ├── assets/               # Clinic logos & icons
│   └── css/                  # Modern responsive stylesheets
│
└── api/                      # Backend JavaScript Modules (Mirrors PHP endpoints)
    ├── config/
    │   ├── db.js             # Native MongoDB connection client & helpers
    │   └── auditLogger.js    # Security & compliance audit trail logger
    ├── middleware/
    │   ├── authGuard.js      # Session & RBAC role access verification
    │   └── normalizePhp.js   # Seamless backward-compatibility router
    ├── auth/
    │   └── index.js          # Authentication, login, logout, verification
    ├── client/
    │   └── index.js          # Patient appointment booking & medical dossier
    ├── receptionist/
    │   └── index.js          # Front-desk queue & appointment operations
    ├── doctor/
    │   └── index.js          # Clinical diagnoses, prescriptions & odontogram
    └── admin/
        └── index.js          # User management, RBAC matrix, system settings
```

---

### How to Run

#### Option 1: One-Click (Recommended)
Simply double-click `start_server.bat`.

#### Option 2: Terminal / Command Prompt
1. Open PowerShell or Command Prompt in this folder:
   ```bash
   cd c:\Users\User\Documents\SIA\OptiDent_System\OptiDent_NodeJS
   ```
2. Start the application:
   ```bash
   npm start
   ```
3. Open your browser and navigate to:
   **[http://localhost:3000](http://localhost:3000)**

---

### Default Credentials
- **Super Admin**: `superadmin@optident.com` / `Admin123!` or `password`
- **Doctor**: `doctor@optident.com` / `Admin123!` or `password`
- **Receptionist**: `receptionist@optident.com` / `Admin123!` or `password`
- **Patient**: `patient@gmail.com` / `Admin123!` or `password`
- **BukSU Student Patient**: `2401111884@student.buksu.edu.ph` / `Admin123!` or `password`
- **BukSU Receptionist**: `2401115274@student.buksu.edu.ph` / `Admin123!` or `password`
