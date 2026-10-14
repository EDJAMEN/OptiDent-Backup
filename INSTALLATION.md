# OptiDent System - Setup & Running Guide (New PC Installation)

This guide provides simple, step-by-step instructions to clone, set up the MongoDB database, configure PHP, and run OptiDent on any Windows PC.

---

## 1. Prerequisites (Install on the New PC)

Ensure the following tools are installed:

1. **Git for Windows**:
   - Download & install from: [https://git-scm.com/download/win](https://git-scm.com/download/win)
2. **PHP 8.2 or 8.3**:
   - Can be installed via **Windows Winget**:
     ```powershell
     winget install PHP.PHP.8.3
     ```
   - Or download standard PHP zip from [windows.php.net](https://windows.php.net/download/) and extract to `C:\php`.
3. **MongoDB Community Server**:
   - Download & install from: [https://www.mongodb.com/try/download/community](https://www.mongodb.com/try/download/community)
   - During installation, keep **"Install MongoDB as a Service"** checked so it starts automatically in the background on port `27017`.
4. **PHP MongoDB Extension (`php_mongodb.dll`)**:
   - Download `php_mongodb.dll` matching your PHP version (Thread Safe, x64) from PECL:
     [https://pecl.php.net/package/mongodb](https://pecl.php.net/package/mongodb)
   - Place `php_mongodb.dll` into your PHP `ext\` folder (e.g., `C:\php\ext\` or your PHP installation folder).

---

## 2. Clone the Repository

Open **PowerShell** or **Command Prompt** and run:

```bash
git clone https://github.com/EDJAMEN/OptiDent-Backup.git
cd OptiDent-Backup\OptiDentImplementation
```

---

## 3. Verify Database Connection

Make sure MongoDB service is active. You can verify in PowerShell:
```powershell
Get-Service MongoDB
```
If not running as a service, start it manually:
```powershell
mongod --dbpath="C:\data\db"
```

---

## 4. One-Time Database Seeder Initialization

Inside the `OptiDentImplementation` folder, run the automated seeders to create initial Super Admin credentials, RBAC permissions, and clinic operating settings:

```powershell
php -c php.ini api/config/seed_superadmin.php
php -c php.ini api/config/seed_rbac.php
php -c php.ini api/config/seed_system_settings.php
```

---

## 5. Start the System Locally

Run PHP's built-in web server:

```powershell
php -c php.ini -S 127.0.0.1:8080
```

---

## 6. Accessing the System in Your Web Browser

Open your browser and navigate to:
- **Main Portal / Landing Page**: [http://127.0.0.1:8080/index.html](http://127.0.0.1:8080/index.html)

### Default Login Accounts:

| Role | Login URL | Email | Password |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `http://127.0.0.1:8080/index.html` (Master Login) | `superadmin@optident.com` | `Admin123!` |
| **Doctor / Dentist** | `http://127.0.0.1:8080/doctor_login.html` | Doctor account created via Admin / Invite | Assigned password |
| **Receptionist** | `http://127.0.0.1:8080/receptionist_login.html` | Receptionist account created via Admin / Invite | Assigned password |
| **Client / Patient** | `http://127.0.0.1:8080/client_login.html` | Self-registered or Walk-in invited patient | Registered password |

---

## 7. Quick Troubleshooting

- **"Class 'MongoDB\Driver\Manager' not found"**:
  Make sure `php_mongodb.dll` is located in your PHP `ext\` directory and enabled in `php.ini`.
- **Database Connection Error**:
  Ensure MongoDB service is running on `127.0.0.1:27017`.
- **Port 8080 in use**:
  Run on an alternate port: `php -c php.ini -S 127.0.0.1:8000`.
