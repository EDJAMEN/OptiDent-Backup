import bcrypt from 'bcryptjs';
import dbClient from './api/config/db.js';

async function seed() {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const past1 = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
    const past2 = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);

    const hash = bcrypt.hashSync('Admin123!', 10);

    // 1. Ensure system settings
    const clinicProfile = {
        setting_type: 'clinic_profile',
        clinic_name: 'OptiDent Dental Clinic',
        tagline: 'Advanced Digital Dental Care & Clinic Management',
        contact_email: 'superadmin@optident.com',
        contact_phone: '+63 (032) 412-8899',
        address: 'Suite 402, MedTech Tower, Osmeña Blvd, Cebu City, Philippines',
        operating_days: 'Mon - Sat',
        opening_time: '08:00 AM',
        closing_time: '05:00 PM',
        lunch_break: true,
        operating_hours: 'Mon - Sat: 08:00 AM - 05:00 PM | Sun: Closed',
        timezone: 'Asia/Manila',
        time_slots: ['08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM', '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM'],
        integrations: {
            google_auth_enabled: true,
            allow_non_admin_logins: true,
            smtp_email_enabled: true,
            sms_gateway_enabled: false,
            patient_self_registration: true,
            patient_online_booking: true,
            patient_rescheduling_enabled: true,
            maintenance_mode: false
        }
    };
    await dbClient.updateOne('system_settings', { setting_type: 'clinic_profile' }, { $set: clinicProfile }, { upsert: true });

    // Ensure email SMTP settings
    await dbClient.updateOne('system_settings', { setting_type: 'email_config' }, {
        $set: {
            setting_type: 'email_config',
            smtp_user: 'optidentt@gmail.com',
            smtp_pass: 'emuvfyqhuyyafpku',
            smtp_host: 'smtp.gmail.com',
            smtp_port: 587,
            updated_at: new Date().toISOString()
        }
    }, { upsert: true });

    // 2. Ensure Users
    const usersToUpsert = [
        {
            email: 'superadmin@optident.com',
            full_name: 'Dr. Super Admin',
            phone: '09171234567',
            password_hash: hash,
            role: 'super_admin',
            status: 'active',
            is_master: true,
            is_active: true,
            professional_id: 'PRC-SA-001',
            position: 'Chief Executive Dental Officer'
        },
        {
            email: 'doctor@optident.com',
            full_name: 'Dr. Maria Santos',
            phone: '09181234567',
            password_hash: hash,
            role: 'doctor',
            status: 'active',
            is_master: false,
            is_active: true,
            specialization: 'Orthodontics & General Dentistry',
            professional_id: 'PRC-098231',
            working_days: 'Mon - Sat',
            opening_time: '08:00 AM',
            closing_time: '05:00 PM',
            lunch_break: true,
            schedule_days: 'Mon - Sat (08:00 AM - 05:00 PM)',
            time_slots: ['08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM', '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM']
        },
        {
            email: 'receptionist@optident.com',
            full_name: 'Sarah Connor',
            phone: '09191234567',
            password_hash: hash,
            role: 'receptionist',
            status: 'active',
            is_master: false,
            is_active: true,
            position: 'Lead Front-Desk Coordinator'
        },
        {
            email: 'patient@gmail.com',
            full_name: 'Juan Dela Cruz',
            phone: '09201234567',
            password_hash: hash,
            role: 'patient',
            status: 'active',
            dob: '1992-06-15',
            gender: 'Male',
            blood_type: 'O+',
            allergies: 'None recorded',
            medical_alerts: 'None recorded',
            emergency_contact_name: 'Maria Dela Cruz',
            emergency_contact_phone: '09181112223'
        },
        {
            email: 'beatriz.ramos@gmail.com',
            full_name: 'Beatriz Ramos',
            phone: '09223334445',
            password_hash: hash,
            role: 'patient',
            status: 'active',
            dob: '1998-09-21',
            gender: 'Female',
            blood_type: 'A+',
            allergies: 'Latex Powdered Gloves',
            medical_alerts: 'Latex Allergy - Use Nitrile Gloves',
            emergency_contact_name: 'Ricardo Ramos',
            emergency_contact_phone: '09223334445'
        },
        {
            email: '2401111884@student.buksu.edu.ph',
            full_name: 'BukSU Student Patient',
            phone: '09951234567',
            password_hash: hash,
            role: 'patient',
            status: 'active',
            dob: '2003-04-12',
            gender: 'Female',
            blood_type: 'B+',
            allergies: 'None recorded',
            medical_alerts: 'None recorded'
        }
    ];

    for (const u of usersToUpsert) {
        await dbClient.updateOne('users', { email: u.email }, { $set: u }, { upsert: true });
    }

    // 3. Clear and seed realistic sample appointments
    await dbClient.deleteMany('appointments', {});

    const sampleAppointments = [
        // Today - In Chair / In Progress
        {
            patient_name: 'Juan Dela Cruz',
            patient_email: 'patient@gmail.com',
            patient_phone: '09201234567',
            doctor_name: 'Dr. Maria Santos',
            attending_doctor: 'Dr. Maria Santos',
            service_name: 'Oral Prophylaxis (Dental Cleaning)',
            treatment_category: 'Preventive',
            appointment_date: today,
            date: today,
            time_slot: '09:00 AM',
            appointment_time: '09:00 AM',
            operatory_chair: 'Operatory Chair 1',
            status: 'in_progress',
            queue_number: 1,
            queue_priority: 'normal',
            is_walkin: false,
            notes: 'Patient arrived on time, currently undergoing dental scaling.',
            checked_in_at: `${today} 08:50:00`,
            is_deleted: false,
            is_archived: false,
            created_at: `${today} 08:30:00`
        },
        // Today - Checked In / Waiting
        {
            patient_name: 'Beatriz Ramos',
            patient_email: 'beatriz.ramos@gmail.com',
            patient_phone: '09223334445',
            doctor_name: 'Dr. Maria Santos',
            attending_doctor: 'Dr. Maria Santos',
            service_name: 'Tooth Restoration / Light-Cure Composite Filling',
            treatment_category: 'Restorative',
            appointment_date: today,
            date: today,
            time_slot: '10:00 AM',
            appointment_time: '10:00 AM',
            operatory_chair: 'Operatory Chair 2',
            status: 'checked_in',
            queue_number: 2,
            queue_priority: 'normal',
            is_walkin: false,
            notes: 'Patient waiting in lobby. Alert: Latex sensitivity.',
            checked_in_at: `${today} 09:45:00`,
            is_deleted: false,
            is_archived: false,
            created_at: `${today} 08:00:00`
        },
        // Today - Scheduled
        {
            patient_name: 'BukSU Student Patient',
            patient_email: '2401111884@student.buksu.edu.ph',
            patient_phone: '09951234567',
            doctor_name: 'Dr. Maria Santos',
            attending_doctor: 'Dr. Maria Santos',
            service_name: 'Dental Consultation & Oral Examination',
            treatment_category: 'Diagnostic',
            appointment_date: today,
            date: today,
            time_slot: '01:00 PM',
            appointment_time: '01:00 PM',
            operatory_chair: 'Operatory Chair 1',
            status: 'scheduled',
            queue_number: 3,
            queue_priority: 'normal',
            is_walkin: false,
            notes: 'Routine dental checkup booked online.',
            is_deleted: false,
            is_archived: false,
            created_at: `${today} 07:30:00`
        },
        // Tomorrow - Upcoming
        {
            patient_name: 'Juan Dela Cruz',
            patient_email: 'patient@gmail.com',
            patient_phone: '09201234567',
            doctor_name: 'Dr. Maria Santos',
            attending_doctor: 'Dr. Maria Santos',
            service_name: 'Tooth Restoration / Light-Cure Composite Filling',
            treatment_category: 'Restorative',
            appointment_date: tomorrow,
            date: tomorrow,
            time_slot: '10:00 AM',
            appointment_time: '10:00 AM',
            operatory_chair: 'Operatory Chair 1',
            status: 'scheduled',
            is_walkin: false,
            notes: 'Follow-up restoration for upper molar.',
            is_deleted: false,
            is_archived: false,
            created_at: `${today} 09:00:00`
        },
        // Next Week - Upcoming
        {
            patient_name: 'Beatriz Ramos',
            patient_email: 'beatriz.ramos@gmail.com',
            patient_phone: '09223334445',
            doctor_name: 'Dr. Maria Santos',
            attending_doctor: 'Dr. Maria Santos',
            service_name: 'Teeth Whitening / Bleaching',
            treatment_category: 'Cosmetic',
            appointment_date: nextWeek,
            date: nextWeek,
            time_slot: '02:00 PM',
            appointment_time: '02:00 PM',
            operatory_chair: 'Operatory Chair 1',
            status: 'scheduled',
            is_walkin: false,
            notes: 'Cosmetic whitening session.',
            is_deleted: false,
            is_archived: false,
            created_at: `${today} 09:05:00`
        },
        // Past - Completed Record with Odontogram & Prescription
        {
            patient_name: 'Juan Dela Cruz',
            patient_email: 'patient@gmail.com',
            patient_phone: '09201234567',
            doctor_name: 'Dr. Maria Santos',
            attending_doctor: 'Dr. Maria Santos',
            service_name: 'Dental Consultation & Oral Examination',
            treatment_category: 'Diagnostic',
            appointment_date: past1,
            date: past1,
            time_slot: '09:00 AM',
            appointment_time: '09:00 AM',
            operatory_chair: 'Operatory Chair 1',
            status: 'completed',
            is_walkin: false,
            diagnosis: 'Class I Occlusal Pit & Fissure Caries on Tooth 16 and 46',
            teeth_selected: ['16', '46'],
            tooth_surfaces: ['O'],
            procedure_notes: 'Thorough clinical visual exam and periodontal probing. Advised composite resin restorations.',
            prescription: 'Amoxicillin 500mg TID for 5 days; Mefenamic Acid 500mg PRN for pain',
            completed_at: `${past1} 09:45:00`,
            is_deleted: false,
            is_archived: false,
            created_at: `${past1} 08:30:00`
        },
        // Past - Completed Record
        {
            patient_name: 'Beatriz Ramos',
            patient_email: 'beatriz.ramos@gmail.com',
            patient_phone: '09223334445',
            doctor_name: 'Dr. Maria Santos',
            attending_doctor: 'Dr. Maria Santos',
            service_name: 'Oral Prophylaxis (Dental Cleaning)',
            treatment_category: 'Preventive',
            appointment_date: past2,
            date: past2,
            time_slot: '11:00 AM',
            appointment_time: '11:00 AM',
            operatory_chair: 'Operatory Chair 2',
            status: 'completed',
            is_walkin: false,
            diagnosis: 'Mild gingivitis with supragingival calculus accumulation.',
            teeth_selected: ['11', '12', '21', '22', '31', '41'],
            procedure_notes: 'Ultrasonic scaling and prophy paste polishing performed. Nitrile gloves used.',
            prescription: 'Chlorhexidine 0.12% oral rinse 15ml BID for 7 days',
            completed_at: `${past2} 11:40:00`,
            is_deleted: false,
            is_archived: false,
            created_at: `${past2} 10:30:00`
        }
    ];

    for (const apt of sampleAppointments) {
        await dbClient.insertOne('appointments', apt);
    }

    // 4. Seed Audit Logs
    await dbClient.deleteMany('audit_logs', {});
    const sampleLogs = [
        {
            action: 'USER_LOGIN',
            category: 'AUTH',
            user_email: 'superadmin@optident.com',
            user_role: 'super_admin',
            details: { message: 'Super admin authenticated' },
            ip_address: '127.0.0.1',
            status: 'success',
            created_at: `${today} 08:00:15`
        },
        {
            action: 'APPOINTMENT_SCHEDULED',
            category: 'CLIENT',
            user_email: 'patient@gmail.com',
            user_role: 'patient',
            details: { service: 'Dental Consultation', date: today },
            ip_address: '127.0.0.1',
            status: 'success',
            created_at: `${today} 08:15:30`
        },
        {
            action: 'PATIENT_CHECKED_IN',
            category: 'RECEPTIONIST',
            user_email: 'receptionist@optident.com',
            user_role: 'receptionist',
            details: { patient: 'Juan Dela Cruz', chair: 'Operatory Chair 1' },
            ip_address: '127.0.0.1',
            status: 'success',
            created_at: `${today} 08:50:00`
        }
    ];

    for (const log of sampleLogs) {
        await dbClient.insertOne('audit_logs', log);
    }

    console.log('✅ Seed complete: Users, System Profile, Appointments, and Audit Logs seeded successfully!');
    process.exit(0);
}

seed().catch(err => {
    console.error('Seed error:', err);
    process.exit(1);
});

