-- ============================================================
-- DentAssist Dental Clinic Management System
-- Normalized Database Schema (3NF) — Complete & Production-Ready
-- 
-- HOW TO USE:
--   phpMyAdmin > SQL tab > paste this entire file > click Go
--
-- WARNING: Drops and recreates dental_clinic_db from scratch.
--          Export any live data first before running.
-- ============================================================

DROP DATABASE IF EXISTS `dental_clinic_db`;
CREATE DATABASE `dental_clinic_db`
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;
USE `dental_clinic_db`;

-- ============================================================
-- TABLE 1: users
-- All system accounts: admin, dentist, staff, patient
-- ============================================================
CREATE TABLE `users` (
    `id`              INT(11)      NOT NULL AUTO_INCREMENT,
    `full_name`       VARCHAR(100) NOT NULL,
    `email`           VARCHAR(100) NOT NULL UNIQUE,
    `phone`           VARCHAR(20)  NOT NULL,
    `password_hash`   VARCHAR(255) NOT NULL,
    `role`            ENUM('admin','dentist','staff','patient') NOT NULL DEFAULT 'patient',
    `status`          ENUM('pending','active','suspended')      NOT NULL DEFAULT 'active',
    `is_master`       BOOLEAN      NOT NULL DEFAULT FALSE,
    `is_active`       BOOLEAN      NOT NULL DEFAULT TRUE,
    -- Staff/Dentist fields
    `professional_id` VARCHAR(50)  DEFAULT NULL,
    `position`        VARCHAR(100) DEFAULT NULL,
    -- OAuth
    `google_id`       VARCHAR(255) DEFAULT NULL,
    -- Timestamps
    `created_at`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `deleted_at`      TIMESTAMP    NULL     DEFAULT NULL,   -- soft-delete for Archive feature
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE 2: patients_meta
-- Extended medical profile — one row per patient
-- ============================================================
CREATE TABLE `patients_meta` (
    `user_id`                  INT(11)      NOT NULL,
    `dob`                      DATE         DEFAULT NULL,
    `emergency_contact_name`   VARCHAR(100) DEFAULT NULL,
    `emergency_contact_phone`  VARCHAR(20)  DEFAULT NULL,
    `allergies`                TEXT         DEFAULT NULL,
    `medications`              TEXT         DEFAULT NULL,
    `reward_points`            INT(11)      NOT NULL DEFAULT 0,
    PRIMARY KEY (`user_id`),
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE 3: services
-- Dental procedures offered by the clinic
-- ============================================================
CREATE TABLE `services` (
    `id`               INT(11)        NOT NULL AUTO_INCREMENT,
    `name`             VARCHAR(100)   NOT NULL,
    `description`      TEXT           DEFAULT NULL,
    `price`            DECIMAL(10,2)  NOT NULL,
    `duration_minutes` INT(11)        NOT NULL DEFAULT 30,
    `is_active`        BOOLEAN        NOT NULL DEFAULT TRUE,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE 4: schedule_settings
-- Clinic operating hours and break times
-- ============================================================
CREATE TABLE `schedule_settings` (
    `id`            INT(11)      NOT NULL AUTO_INCREMENT,
    `setting_key`   VARCHAR(50)  NOT NULL UNIQUE,
    `setting_value` VARCHAR(255) NOT NULL,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE 5: rewards
-- Reward catalog — discounts and free services
-- ============================================================
CREATE TABLE `rewards` (
    `id`              INT(11)        NOT NULL AUTO_INCREMENT,
    `name`            VARCHAR(100)   NOT NULL,
    `description`     TEXT           DEFAULT NULL,
    `points_required` INT(11)        NOT NULL,
    `reward_type`     ENUM('discount','service') NOT NULL,
    `value`           DECIMAL(10,2)  DEFAULT NULL,   -- ₱ value of the discount
    `service_id`      INT(11)        DEFAULT NULL,   -- linked service (for free-service rewards)
    `is_active`       BOOLEAN        NOT NULL DEFAULT TRUE,
    PRIMARY KEY (`id`),
    FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE 6: appointments
-- Core scheduling table — links patient, dentist, service
-- ============================================================
CREATE TABLE `appointments` (
    `id`                  INT(11)  NOT NULL AUTO_INCREMENT,
    `patient_id`          INT(11)  NOT NULL,
    `dentist_id`          INT(11)  DEFAULT NULL,
    `service_id`          INT(11)  NOT NULL,
    `reward_id`           INT(11)  DEFAULT NULL,   -- reward applied at booking
    `appointment_date`    DATE     NOT NULL,
    `start_time`          TIME     NOT NULL,
    `end_time`            TIME     NOT NULL,
    `status`              ENUM('pending','upcoming','completed','cancelled','walk-in')
                                   NOT NULL DEFAULT 'pending',
    `cancellation_reason` TEXT     DEFAULT NULL,   -- filled on decline/cancel
    `is_offline_sync`     BOOLEAN  DEFAULT FALSE,
    `created_at`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    FOREIGN KEY (`patient_id`) REFERENCES `users`(`id`)    ON DELETE CASCADE,
    FOREIGN KEY (`dentist_id`) REFERENCES `users`(`id`)    ON DELETE SET NULL,
    FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`reward_id`)  REFERENCES `rewards`(`id`)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE 7: invoices
-- Auto-generated on appointment completion
-- ============================================================
CREATE TABLE `invoices` (
    `id`              INT(11)        NOT NULL AUTO_INCREMENT,
    `patient_id`      INT(11)        NOT NULL,
    `appointment_id`  INT(11)        DEFAULT NULL,
    `total_amount`    DECIMAL(10,2)  NOT NULL,
    `discount_amount` DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
    `status`          ENUM('unpaid','partially_paid','paid','cancelled')
                                     NOT NULL DEFAULT 'unpaid',
    `created_at`      TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    FOREIGN KEY (`patient_id`)     REFERENCES `users`(`id`)         ON DELETE CASCADE,
    FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE 8: treatments
-- Clinical record per appointment (tooth number, notes)
-- ============================================================
CREATE TABLE `treatments` (
    `id`             INT(11) NOT NULL AUTO_INCREMENT,
    `appointment_id` INT(11) NOT NULL,
    `tooth_number`   VARCHAR(10) DEFAULT NULL,
    `diagnosis`      TEXT        DEFAULT NULL,
    `clinical_notes` TEXT        DEFAULT NULL,
    `created_at`     TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE 9: reward_points_logs
-- Full transaction history of point earnings and redemptions
-- ============================================================
CREATE TABLE `reward_points_logs` (
    `id`         INT(11)     NOT NULL AUTO_INCREMENT,
    `patient_id` INT(11)     NOT NULL,
    `points`     INT(11)     NOT NULL,
    `action`     ENUM('earned','redeemed') NOT NULL,
    `reason`     VARCHAR(255) NOT NULL,
    `created_at` TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    FOREIGN KEY (`patient_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE 10: chat_history
-- AI chatbot conversation log per patient
-- ============================================================
CREATE TABLE `chat_history` (
    `id`         INT(11)              NOT NULL AUTO_INCREMENT,
    `patient_id` INT(11)              NOT NULL,
    `message`    TEXT                 NOT NULL,
    `sender`     ENUM('user','ai')    NOT NULL,
    `created_at` TIMESTAMP            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    FOREIGN KEY (`patient_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE 11: sync_logs
-- Offline mode sync tracking
-- ============================================================
CREATE TABLE `sync_logs` (
    `id`         INT(11)      NOT NULL AUTO_INCREMENT,
    `action`     VARCHAR(50)  NOT NULL,
    `table_name` VARCHAR(50)  NOT NULL,
    `record_id`  INT(11)      DEFAULT NULL,
    `payload`    TEXT         DEFAULT NULL,
    `created_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ============================================================
-- SEED DATA — Default clinic setup
-- ============================================================

-- Clinic hours
INSERT INTO `schedule_settings` (`setting_key`, `setting_value`) VALUES
('clinic_open',  '08:00:00'),
('clinic_close', '17:00:00'),
('break_start',  '12:00:00'),
('break_end',    '13:00:00');

-- Default accounts (passwords stored plain-text — prototype only)
-- admin@dentassist.com / 123456  → Master Admin
-- ana@dentassist.com  / 123456  → Dentist
-- maria@gmail.com     / 123456  → Patient
INSERT INTO `users`
    (`id`, `full_name`, `email`, `phone`, `password_hash`, `role`, `status`, `is_master`, `is_active`)
VALUES
    (1, 'Dr. L. Reyes', 'admin@dentassist.com', '09170000000', '123456', 'admin',   'active', 1, 1),
    (2, 'Dr. Ana Cruz',  'ana@dentassist.com',   '09171234567', '123456', 'dentist', 'active', 0, 1),
    (3, 'Maria Santos',  'maria@gmail.com',       '09171112222', '123456', 'patient', 'active', 0, 1);

-- Patient medical record for Maria
INSERT INTO `patients_meta` (`user_id`, `dob`, `allergies`, `reward_points`)
VALUES (3, '1995-05-10', 'None', 120);

-- Default services
INSERT INTO `services` (`id`, `name`, `description`, `price`, `duration_minutes`) VALUES
(1, 'Teeth Cleaning (Prophylaxis)', 'Basic teeth cleaning and polishing.',   800.00,   30),
(2, 'Tooth Extraction',             'Safe removal of a damaged tooth.',       1200.00,  45),
(3, 'Laser Teeth Whitening',        'Advanced whitening session.',            5000.00,  60),
(4, 'Braces / Orthodontics',        'Alignment and braces consultation.',     15000.00, 60),
(5, 'Dental Consultation',          'Initial checkup and assessment.',        500.00,   15),
(6, 'Dental Filling',               'Composite resin tooth filling.',         1500.00,  30),
(7, 'Root Canal Treatment',         'Complete root canal therapy.',           8000.00,  90),
(8, 'Dental Crown',                 'Porcelain or metal dental crown.',       6000.00,  60);

-- Rewards catalog
INSERT INTO `rewards` (`name`, `description`, `points_required`, `reward_type`, `value`, `service_id`) VALUES
('₱50 Discount',        'Get ₱50 off your next treatment.',    100, 'discount', 50.00,   NULL),
('₱100 Discount',       'Get ₱100 off your next treatment.',   200, 'discount', 100.00,  NULL),
('₱200 Discount',       'Get ₱200 off your next treatment.',   400, 'discount', 200.00,  NULL),
('Free Consultation',    'One free dental checkup.',            300, 'service',  500.00,  5),
('Free Teeth Cleaning',  'One free prophylaxis session.',       500, 'service',  800.00,  1);

-- Sample reward point history for Maria
INSERT INTO `reward_points_logs` (`patient_id`, `points`, `action`, `reason`) VALUES
(3, 50,  'earned', 'Welcome bonus'),
(3, 50,  'earned', 'First visit completed'),
(3, 20,  'earned', 'Booking bonus');

-- Sample appointment for today (for testing)
INSERT INTO `appointments`
    (`patient_id`, `dentist_id`, `service_id`, `appointment_date`, `start_time`, `end_time`, `status`)
VALUES
    (3, 2, 5, CURDATE(), '10:00:00', '10:15:00', 'upcoming');
