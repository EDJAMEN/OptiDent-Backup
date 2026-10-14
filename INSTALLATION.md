# DentAssist Installation & Setup Manual

Welcome to the **DentAssist** installation guide. This document provides step-by-step instructions to set up the clinic management system on your local machine or a live server.

---

## 1. System Requirements

To run DentAssist, ensure your environment meets the following specifications:

*   **Web Server:** Apache (via XAMPP, WAMP, or Laragon)
*   **PHP Version:** 7.4 or higher
*   **Database:** MySQL 5.7+ or MariaDB 10.4+
*   **Web Browser:** Chrome, Firefox, Edge, or Safari (Latest versions)

---

## 2. Local Environment Setup (XAMPP)

1.  **Download and Install XAMPP:**
    Download XAMPP from [apachefriends.org](https://www.apachefriends.org/) and install it.
2.  **Clone or Copy Project:**
    Place the `DentAssist_System1` folder into your XAMPP's root directory:
    `C:\xampp\htdocs\DentAssist_System1`
3.  **Start Services:**
    Open the **XAMPP Control Panel** and start **Apache** and **MySQL**.

---

## 3. Database Configuration

1.  **Access phpMyAdmin:**
    Open your browser and go to `http://localhost/phpmyadmin`.
2.  **Create Database:**
    Create a new database named `dental_clinic_db`.
3.  **Import Schema:**
    *   Select `dental_clinic_db` from the sidebar.
    *   Click on the **Import** tab.
    *   Choose the file located at: `database/schema.sql`.
    *   Click **Go** at the bottom of the page.
    *   *(Alternatively, copy the content of `database/schema.sql` and paste it into the **SQL** tab).*

---

## 4. Application Configuration

### 4.1 Database Connection
Navigate to `api/config/database.php` and ensure the credentials match your local setup:

```php
// api/config/database.php
$conn = new mysqli("127.0.0.1", "root", "", "dental_clinic_db");
```

*   **Host:** `127.0.0.1` or `localhost`
*   **User:** `root` (Default for XAMPP)
*   **Password:** `""` (Empty by default)
*   **Database:** `dental_clinic_db`

### 4.2 ReCAPTCHA (Optional)
The system currently uses Google's Test Keys for ReCAPTCHA. For production use, update the keys in:
*   `index.html` (Site Key)
*   `api/auth/recaptcha_verify.php` (Secret Key)

---

## 5. Launching the Application

Once the database is imported and configured:
1.  Open your browser.
2.  Navigate to: `http://localhost/DentAssist_System1/`
3.  The system should load the main login/landing page.

---

## 6. Default Credentials

The following accounts are pre-seeded in the database for testing purposes:

| Role | Email | Password |
| :--- | :--- | :--- |
| **Admin** | `admin@dentassist.com` | `123456` |
| **Dentist** | `ana@dentassist.com` | `123456` |
| **Patient** | `maria@gmail.com` | `123456` |

> [!WARNING]
> **Security Note:** These passwords are in plain text for prototype testing. In a production environment, please use the registration system to create secure, hashed accounts.

---

## 7. Troubleshooting

*   **Database Connection Error:** Verify that MySQL is running in XAMPP and that the credentials in `api/config/database.php` are correct.
*   **Page Not Found (404):** Ensure the folder name in `htdocs` exactly matches the URL path.
*   **Permission Denied:** Ensure your local server has read/write permissions for the project folder.

---

*Manual generated for DentAssist v1.0*
