import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import dbClient from '../config/db.js';
import requireAuth from '../middleware/authGuard.js';
import logAudit from '../config/auditLogger.js';
import { sendStaffInvitationEmail, sendAppointmentNotificationEmail } from '../config/mailer.js';
import { getServicePrice, formatPhp } from '../config/servicePricing.js';

const router = express.Router();

router.use(requireAuth(['super_admin', 'admin']));

/**
 * SA-003: Get All Users
 */
router.get('/get_users', async (req, res) => {
    try {
        const roleFilter = (req.query.role || 'all').toLowerCase();
        const statusFilter = (req.query.status || 'all').toLowerCase();
        const search = (req.query.search || '').toLowerCase();

        const allUsers = await dbClient.find('users', {});
        const filtered = allUsers.filter(u => {
            if (u.is_deleted || u.status === 'deleted' || u.is_archived) return false;

            const uRole = (u.role || '').toLowerCase();
            if (roleFilter !== 'all') {
                if (roleFilter === 'client' && uRole !== 'patient') return false;
                if (roleFilter !== 'client' && uRole !== roleFilter) return false;
            }

            if (statusFilter !== 'all' && (u.status || 'active').toLowerCase() !== statusFilter) return false;

            if (search) {
                const name = (u.full_name || '').toLowerCase();
                const email = (u.email || '').toLowerCase();
                const phone = (u.phone || '').toLowerCase();
                if (!name.includes(search) && !email.includes(search) && !phone.includes(search)) return false;
            }

            return true;
        });

        const sanitized = filtered.map(u => ({
            id: String(u._id),
            _id: String(u._id),
            full_name: u.full_name || 'Unnamed',
            email: u.email,
            phone: u.phone || 'N/A',
            role: (u.role || 'patient').toLowerCase(),
            status: u.status || 'active',
            position: u.position || '',
            specialization: u.specialization || '',
            professional_id: u.professional_id || '',
            created_at: u.created_at || '',
            last_login: u.last_login || null,
            is_master: !!u.is_master
        }));

        return res.status(200).json({
            status: 'success',
            count: sanitized.length,
            users: sanitized
        });
    } catch (err) {
        console.error('Get users error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to retrieve users.' });
    }
});

/**
 * SA-003: Create User
 */
router.post('/create_user', async (req, res) => {
    try {
        const body = req.body;
        const fullName = (body.full_name || '').trim();
        const email = (body.email || '').trim().toLowerCase();
        const role = (body.role || 'patient').toLowerCase();
        const password = (body.password || 'optident123').trim();

        if (!fullName || !email) {
            return res.status(400).json({ status: 'error', message: 'Full name and email are required.' });
        }

        const existing = await dbClient.findOne('users', { email });
        if (existing) {
            return res.status(409).json({ status: 'error', message: 'User with this email already exists.' });
        }

        const passwordHash = bcrypt.hashSync(password, 10);
        const newUser = {
            full_name: fullName,
            email,
            phone: body.phone || '',
            role,
            status: 'active',
            position: body.position || '',
            specialization: body.specialization || '',
            professional_id: body.professional_id || '',
            password_hash: passwordHash,
            created_at: new Date().toISOString().replace('T', ' ').slice(0, 19)
        };

        const result = await dbClient.insertOne('users', newUser);
        await logAudit(req, 'CREATE_USER', 'ADMIN', { user_id: result.insertedId, email, role }, 'success');

        return res.status(201).json({
            status: 'success',
            message: 'User created successfully!',
            user_id: result.insertedId
        });
    } catch (err) {
        console.error('Create user error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to create user.' });
    }
});

/**
 * Update User
 */
/**
 * Helper to resolve user lookup query by ID or Email
 */
async function resolveUserQuery(body) {
    if (body.email) {
        return { email: body.email.trim().toLowerCase() };
    }
    const id = body.id || body.user_id || body._id;
    if (id) {
        return { _id: id };
    }
    return null;
}

/**
 * Update User Details
 */
router.post('/update_user', async (req, res) => {
    try {
        const body = req.body;
        const query = await resolveUserQuery(body);
        if (!query) return res.status(400).json({ status: 'error', message: 'User ID or Email is required.' });

        const existingUser = await dbClient.findOne('users', query);
        if (!existingUser) return res.status(404).json({ status: 'error', message: 'User not found.' });

        const updateData = {
            updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19)
        };
        if (body.full_name) updateData.full_name = body.full_name.trim();
        if (body.phone !== undefined) updateData.phone = body.phone.trim();
        if (body.role) updateData.role = body.role.toLowerCase().trim();
        if (body.status) updateData.status = body.status.toLowerCase().trim();
        if (body.position !== undefined) updateData.position = body.position.trim();
        if (body.specialization !== undefined) updateData.specialization = body.specialization.trim();
        if (body.password) {
            updateData.password_hash = bcrypt.hashSync(body.password.trim(), 10);
        }

        await dbClient.updateOne('users', query, { $set: updateData });
        await logAudit(req, 'UPDATE_USER', 'ADMIN', { email: existingUser.email, update: updateData }, 'success');

        return res.status(200).json({ status: 'success', message: 'User updated successfully.' });
    } catch (err) {
        console.error('Update user error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to update user.' });
    }
});

/**
 * Delete User (Soft Delete)
 */
router.post('/delete_user', async (req, res) => {
    try {
        const query = await resolveUserQuery(req.body);
        if (!query) return res.status(400).json({ status: 'error', message: 'User ID or Email is required.' });

        const user = await dbClient.findOne('users', query);
        if (!user) return res.status(404).json({ status: 'error', message: 'User not found.' });
        if (user.is_master) {
            return res.status(403).json({ status: 'error', message: 'Master Administrator account cannot be deleted.' });
        }

        const reason = (req.body.reason || 'Deactivated by Super Admin').trim();
        await dbClient.updateOne('users', query, {
            $set: {
                is_deleted: true,
                status: 'deleted',
                deleted_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
                deleted_by: req.user.email,
                delete_reason: reason
            }
        });

        await logAudit(req, 'DELETE_USER', 'ADMIN', { email: user.email, reason }, 'success');
        return res.status(200).json({ status: 'success', message: `User ${user.email} moved to deleted records vault.` });
    } catch (err) {
        console.error('Delete user error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to delete user.' });
    }
});

/**
 * Toggle User Status (Active / Inactive)
 */
router.post('/toggle_user_status', async (req, res) => {
    try {
        const query = await resolveUserQuery(req.body);
        if (!query) return res.status(400).json({ status: 'error', message: 'User ID or Email is required.' });

        const user = await dbClient.findOne('users', query);
        if (!user) return res.status(404).json({ status: 'error', message: 'User not found.' });

        const newStatus = (user.status || 'active').toLowerCase() === 'active' ? 'inactive' : 'active';
        await dbClient.updateOne('users', query, {
            $set: { status: newStatus, updated_at: new Date().toISOString() }
        });

        await logAudit(req, 'TOGGLE_USER_STATUS', 'ADMIN', { email: user.email, new_status: newStatus }, 'success');
        return res.status(200).json({ status: 'success', message: `User status changed to ${newStatus}.`, new_status: newStatus });
    } catch (err) {
        console.error('Toggle status error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to toggle status.' });
    }
});

/**
 * SA-004: RBAC Permissions Matrix
 */
router.get('/get_rbac_matrix', async (req, res) => {
    try {
        const allUsers = await dbClient.find('users', {});
        const roleCounts = {
            super_admin: allUsers.filter(u => ['super_admin', 'admin'].includes((u.role || '').toLowerCase()) && !u.is_deleted).length,
            doctor: allUsers.filter(u => ['doctor', 'dentist'].includes((u.role || '').toLowerCase()) && !u.is_deleted).length,
            receptionist: allUsers.filter(u => ['receptionist', 'staff'].includes((u.role || '').toLowerCase()) && !u.is_deleted).length,
            patient: allUsers.filter(u => ['patient', 'client'].includes((u.role || '').toLowerCase()) && !u.is_deleted).length
        };

        const rolesList = [
            { id: "super_admin", name: "Super Admin", icon: "bx bx-shield-quarter", description: "Executive clinic administrator with full master permissions.", user_count: roleCounts.super_admin },
            { id: "doctor", name: "Doctor (Dentist)", icon: "bx bxs-first-aid", description: "Licensed dental practitioner charting & treatment.", user_count: roleCounts.doctor },
            { id: "receptionist", name: "Receptionist (Staff)", icon: "bx bx-user", description: "Front-desk queue, walk-ins, and appointments.", user_count: roleCounts.receptionist },
            { id: "patient", name: "Client / Patient", icon: "bx bx-smile", description: "Registered dental patient with self-service booking.", user_count: roleCounts.patient }
        ];

        const defaultPermissions = [
            // User Management
            { module: "User Management", key: "users_view", permission_key: "users_view", name: "View Users Directory", label: "View Users Directory", description: "Access staff directory, roles, and patient records.", roles: ["super_admin"] },
            { module: "User Management", key: "users_create", permission_key: "users_create", name: "Create & Invite Users", label: "Create & Invite Users", description: "Add new staff accounts and generate registration invites.", roles: ["super_admin"] },
            { module: "User Management", key: "users_edit", permission_key: "users_edit", name: "Edit User Details & Roles", label: "Edit User Details & Roles", description: "Reassign roles, edit contact details, and reset passwords.", roles: ["super_admin"] },
            { module: "User Management", key: "users_delete", permission_key: "users_delete", name: "Suspend & Delete Accounts", label: "Suspend & Delete Accounts", description: "Deactivate, suspend, or archive user accounts.", roles: ["super_admin"] },

            // Appointments & Queue
            { module: "Appointments & Queue", key: "appts_view_all", permission_key: "appts_view_all", name: "View Clinic Calendar", label: "View Clinic Calendar", description: "Access the full master appointment schedule and clinic calendar.", roles: ["super_admin", "doctor", "receptionist"] },
            { module: "Appointments & Queue", key: "appts_manage", permission_key: "appts_manage", name: "Manage Appointments & Queue", label: "Manage Appointments & Queue", description: "Call queue numbers, book walk-ins, reschedule, and cancel visits.", roles: ["super_admin", "receptionist"] },
            { module: "Appointments & Queue", key: "appts_checkin", permission_key: "appts_checkin", name: "Fast-Pass QR Check-in", label: "Fast-Pass QR Check-in", description: "Scan and validate patient arrival QR passes at reception.", roles: ["super_admin", "receptionist"] },

            // Clinical & Medical Charting
            { module: "Clinical & Odontogram", key: "clinical_view", permission_key: "clinical_view", name: "View Medical & Dental Records", label: "View Medical & Dental Records", description: "Review patient dental history, past procedures, and clinical notes.", roles: ["super_admin", "doctor"] },
            { module: "Clinical & Odontogram", key: "clinical_write", permission_key: "clinical_write", name: "Interactive Odontogram Charting", label: "Interactive Odontogram Charting", description: "Chart teeth conditions, record diagnoses, and prescribe treatments.", roles: ["super_admin", "doctor"] },
            { module: "Clinical & Odontogram", key: "clinical_rx", permission_key: "clinical_rx", name: "Issue Prescriptions & Care Plans", label: "Issue Prescriptions & Care Plans", description: "Generate digital medicine prescriptions and post-procedure care.", roles: ["super_admin", "doctor"] },

            // Patient Self-Service
            { module: "Patient Self-Service", key: "patient_portal", permission_key: "patient_portal", name: "Book & Reschedule Visits", label: "Book & Reschedule Visits", description: "Self-service online appointment booking, dentists, and time slots.", roles: ["super_admin", "patient"] },
            { module: "Patient Self-Service", key: "patient_records", permission_key: "patient_records", name: "View Personal Health History", label: "View Personal Health History", description: "Access personal upcoming appointments, QR passes, and clinical summaries.", roles: ["super_admin", "patient"] },

            // Clinic Pricing & Settings
            { module: "Clinic Administration", key: "pricing_manage", permission_key: "pricing_manage", name: "Manage Procedure Pricing", label: "Manage Procedure Pricing", description: "Edit dental service fees, pricing guides, and discounts.", roles: ["super_admin"] },
            { module: "Clinic Administration", key: "integrations_manage", permission_key: "integrations_manage", name: "Manage System Integrations", label: "Manage System Integrations", description: "Configure Google Calendar API, Google Auth, and SMTP notifications.", roles: ["super_admin"] },
            { module: "Clinic Administration", key: "audit_logs_view", permission_key: "audit_logs_view", name: "Inspect Security & Audit Trail", label: "Inspect Security & Audit Trail", description: "View authentication logs, IP addresses, and user activity history.", roles: ["super_admin"] },

            // Reports & Intelligence Governance (Granular Report Control for Super Admin)
            { module: "Reports & Intelligence Governance", key: "reports_earnings", permission_key: "reports_earnings", name: "Financial Earnings & Revenue Report", label: "Financial Earnings & Revenue Report", description: "Export clinic revenue, payments, procedure collections, and financial breakdowns.", roles: ["super_admin"] },
            { module: "Reports & Intelligence Governance", key: "reports_appointments", permission_key: "reports_appointments", name: "Appointments & Procedures Report", label: "Appointments & Procedures Report", description: "Export master appointment roster, procedure status, timestamps, and doctor schedule.", roles: ["super_admin", "doctor", "receptionist"] },
            { module: "Reports & Intelligence Governance", key: "reports_patients", permission_key: "reports_patients", name: "Patient Registry & Demographics Report", label: "Patient Registry & Demographics Report", description: "Export registered patient database, contact numbers, demographics, and registration dates.", roles: ["super_admin", "receptionist"] },
            { module: "Reports & Intelligence Governance", key: "reports_queues", permission_key: "reports_queues", name: "Live Patient Flow Queue Report", label: "Live Patient Flow Queue Report", description: "Export queue tokens, live waiting room arrivals, turnaround times, and station throughput.", roles: ["super_admin", "receptionist", "doctor"] },
            { module: "Reports & Intelligence Governance", key: "reports_cancellations", permission_key: "reports_cancellations", name: "Cancellations & Attrition Report", label: "Cancellations & Attrition Report", description: "Export canceled appointments, cancellation reasons, no-shows, and attrition rates.", roles: ["super_admin", "receptionist"] },
            { module: "Reports & Intelligence Governance", key: "reports_audit_logs", permission_key: "reports_audit_logs", name: "System Security & Audit Trail Report", label: "System Security & Audit Trail Report", description: "Export system authentication logs, IP addresses, administrative updates, and security trails.", roles: ["super_admin"] },

            // Operations & Reporting
            { module: "Operations & Reporting", key: "reports_operational", permission_key: "reports_operational", name: "Front-Desk Operational Reports", label: "Front-Desk Operational Reports", description: "Generate daily queue summary, attending doctor rosters, visit attendance, and service tallies.", roles: ["super_admin", "receptionist"] },
            { module: "Operations & Reporting", key: "reports_executive", permission_key: "reports_executive", name: "Executive Financial & Audit Reports", label: "Executive Financial & Audit Reports", description: "Access clinic profit margins, full financial collections, and system security audit trails.", roles: ["super_admin"] }
        ];

        let perms = await dbClient.find('roles_permissions', {});
        if (perms.length === 0) {
            for (const p of defaultPermissions) {
                await dbClient.insertOne('roles_permissions', p);
            }
            perms = defaultPermissions;
        } else {
            for (const def of defaultPermissions) {
                const exists = perms.some(p => (p.key || p.permission_key) === def.key);
                if (!exists) {
                    await dbClient.insertOne('roles_permissions', def);
                    perms.push(def);
                }
            }
            perms = perms.map(p => {
                const def = defaultPermissions.find(d => d.key === (p.key || p.permission_key)) || {};
                return {
                    ...def,
                    ...p,
                    key: p.key || p.permission_key || def.key,
                    permission_key: p.permission_key || p.key || def.permission_key,
                    name: p.name || p.label || def.name,
                    label: p.label || p.name || def.label,
                    description: p.description || def.description || 'System permission rule'
                };
            });
        }

        const modules = {};
        for (const p of perms) {
            const mod = p.module || 'General';
            if (!modules[mod]) modules[mod] = [];
            modules[mod].push(p);
        }

        return res.status(200).json({
            status: 'success',
            roles: rolesList,
            modules: modules,
            total_permissions: perms.length
        });
    } catch (err) {
        console.error('RBAC matrix error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to retrieve RBAC matrix.' });
    }
});

/**
 * Update Role Permission
 */
router.post('/update_role_permissions', async (req, res) => {
    try {
        const permKey = req.body.permission_key || req.body.key;
        const role = (req.body.role || '').toLowerCase();
        const enabled = !!req.body.enabled;

        if (!permKey || !role) {
            return res.status(400).json({ status: 'error', message: 'Permission key and role are required.' });
        }

        let perm = await dbClient.findOne('roles_permissions', {
            $or: [{ permission_key: permKey }, { key: permKey }]
        });

        if (!perm) {
            perm = {
                key: permKey,
                permission_key: permKey,
                roles: ['super_admin']
            };
            await dbClient.insertOne('roles_permissions', perm);
        }

        const rolesSet = new Set((perm.roles || []).map(r => r.toLowerCase()));
        rolesSet.add('super_admin'); // super_admin is always preserved

        if (enabled) {
            rolesSet.add(role);
        } else {
            if (role !== 'super_admin') {
                rolesSet.delete(role);
            }
        }

        const updatedRoles = Array.from(rolesSet);
        await dbClient.updateOne('roles_permissions', {
            $or: [{ permission_key: permKey }, { key: permKey }]
        }, {
            $set: {
                key: permKey,
                permission_key: permKey,
                roles: updatedRoles,
                updated_at: new Date().toISOString()
            }
        });

        await logAudit(req, 'UPDATE_RBAC_PERMISSION', 'ADMIN', {
            permission_key: permKey,
            role,
            enabled,
            roles: updatedRoles
        }, 'success');

        return res.status(200).json({
            status: 'success',
            message: `Updated permission '${permKey}' for role '${role}'.`,
            roles: updatedRoles
        });
    } catch (err) {
        console.error('Update permission error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to update permissions.' });
    }
});

/**
 * SA-005: Audit Logs
 */
router.get('/get_audit_logs', async (req, res) => {
    try {
        const logs = await dbClient.find('audit_logs', {}, { sort: { created_at: -1 }, limit: 100 });
        return res.status(200).json({
            status: 'success',
            count: logs.length,
            logs: logs
        });
    } catch (err) {
        console.error('Audit logs error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to load audit logs.' });
    }
});

/**
 * SA-008: System Settings
 */
router.get('/get_system_settings', async (req, res) => {
    try {
        let settings = await dbClient.findOne('system_settings', { setting_type: 'clinic_profile' });
        if (!settings) {
            settings = {
                setting_type: 'clinic_profile',
                clinic_name: 'OptiDent Dental Care Clinic',
                operating_hours: 'Monday - Saturday: 8:00 AM - 5:00 PM',
                email: 'clinic@optident.local',
                phone: '+63 917 123 4567',
                integrations: {
                    google_auth_enabled: true,
                    allow_non_admin_logins: true,
                    smtp_email_enabled: true,
                    sms_gateway_enabled: false,
                    patient_self_registration: true,
                    patient_online_booking: true,
                    patient_rescheduling_enabled: true,
                    recaptcha_enabled: true,
                    maintenance_mode: false
                }
            };
            await dbClient.insertOne('system_settings', settings);
        } else {
            if (!settings.integrations) settings.integrations = {};
            if (settings.integrations.recaptcha_enabled === undefined) {
                settings.integrations.recaptcha_enabled = process.env.ENABLE_RECAPTCHA !== 'false';
            }
        }

        return res.status(200).json({ status: 'success', settings });
    } catch (err) {
        console.error('Settings error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to load settings.' });
    }
});

/**
 * Update System Settings
 */
router.post('/update_system_settings', async (req, res) => {
    try {
        const body = req.body;
        const updateFields = {
            ...body,
            updated_at: new Date().toISOString()
        };
        if (body.maintenance_mode !== undefined) {
            updateFields.maintenance_mode = !!body.maintenance_mode;
            const cur = await dbClient.findOne('system_settings', { setting_type: 'clinic_profile' }) || {};
            const curIntegrations = updateFields.integrations || cur.integrations || {};
            curIntegrations.maintenance_mode = !!body.maintenance_mode;
            updateFields.integrations = curIntegrations;
        }

        await dbClient.updateOne('system_settings', { setting_type: 'clinic_profile' }, {
            $set: updateFields
        });

        await logAudit(req, 'UPDATE_SETTINGS', 'ADMIN', body, 'success');
        return res.status(200).json({ status: 'success', message: 'System settings updated.' });
    } catch (err) {
        console.error('Update settings error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to update settings.' });
    }
});

/**
 * Toggle Integration (Self-service, Maintenance, etc.)
 */
router.post('/toggle_integration', async (req, res) => {
    try {
        const key = req.body.key || req.body.integration;
        const enabled = req.body.enabled;
        if (!key) return res.status(400).json({ status: 'error', message: 'Integration key is required.' });

        const settings = await dbClient.findOne('system_settings', { setting_type: 'clinic_profile' }) || {};
        const integrations = settings.integrations || {};
        integrations[key] = !!enabled;

        const updateFields = {
            integrations,
            updated_at: new Date().toISOString()
        };

        if (key === 'maintenance_mode') {
            updateFields.maintenance_mode = !!enabled;
        }

        // Synchronize process.env for recaptcha
        if (key === 'recaptcha_enabled') {
            process.env.ENABLE_RECAPTCHA = enabled ? 'true' : 'false';
        }

        await dbClient.updateOne('system_settings', { setting_type: 'clinic_profile' }, {
            $set: updateFields
        });

        await logAudit(req, 'TOGGLE_INTEGRATION', 'ADMIN', { key, enabled: !!enabled }, 'success');

        return res.status(200).json({ 
            status: 'success', 
            message: `Integration switch '${key}' set to ${enabled ? 'ENABLED' : 'DISABLED'}.`, 
            integrations,
            maintenance_mode: key === 'maintenance_mode' ? !!enabled : !!settings.maintenance_mode
        });
    } catch (err) {
        console.error('Toggle integration error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to toggle integration.' });
    }
});

/**
 * Google Calendar API Status & Live Incoming Appointments
 */
router.get('/get_google_calendar_status', async (req, res) => {
    try {
        const settings = await dbClient.findOne('system_settings', { setting_type: 'clinic_profile' }) || {};
        const integrations = settings.integrations || {};
        const isEnabled = integrations.google_calendar_sync !== false;
        
        // Target Gmail account: use admin user email or clinic google account
        const targetEmail = req.user?.email || 'optidentt@gmail.com';

        // Retrieve upcoming and active appointments
        const allAppts = await dbClient.find('appointments', {});
        const todayIso = new Date().toISOString().slice(0, 10);
        
        const incoming = allAppts.filter(a => {
            if (a.is_deleted || a.is_archived) return false;
            const status = (a.status || '').toLowerCase();
            const isIncomingStatus = status === 'scheduled' || status === 'confirmed' || status === 'in_treatment' || status === 'pending';
            const apptDate = a.appointment_date || a.date || '';
            return isIncomingStatus && apptDate >= todayIso;
        });

        // Sort ascending by date & time
        incoming.sort((a, b) => {
            const dateA = (a.appointment_date || a.date || '') + ' ' + (a.appointment_time || a.time_slot || a.time || '');
            const dateB = (b.appointment_date || b.date || '') + ' ' + (b.appointment_time || b.time_slot || b.time || '');
            return dateA.localeCompare(dateB);
        });

        return res.status(200).json({
            status: 'success',
            enabled: isEnabled,
            target_email: targetEmail,
            incoming_count: incoming.length,
            last_sync: integrations.google_calendar_last_sync || new Date().toISOString(),
            incoming_appointments: incoming.slice(0, 12).map(a => ({
                id: String(a._id),
                patient_name: a.patient_name || 'Patient',
                service_name: a.service_name || 'Dental Appointment',
                doctor_name: a.doctor_name || a.attending_doctor || 'Attending Dentist',
                date: a.appointment_date || a.date || '--',
                time: a.appointment_time || a.time_slot || a.time || '--',
                chair: a.operatory_chair || 'Operatory Chair 1',
                status: a.status || 'scheduled'
            })),
            google_calendar_url: 'https://calendar.google.com/calendar/u/0/r'
        });
    } catch (err) {
        console.error('Google calendar status error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to retrieve Google Calendar sync status.' });
    }
});

/**
 * Trigger Live Google Calendar Synchronization
 */
const handleGoogleCalendarSync = async (req, res) => {
    try {
        const allAppts = await dbClient.find('appointments', {});
        const todayIso = new Date().toISOString().slice(0, 10);

        const incoming = allAppts.filter(a => {
            if (a.is_deleted || a.is_archived) return false;
            const status = (a.status || '').toLowerCase();
            const isIncomingStatus = status === 'scheduled' || status === 'confirmed' || status === 'in_treatment' || status === 'pending';
            const apptDate = a.appointment_date || a.date || '';
            return isIncomingStatus && apptDate >= todayIso;
        });

        const now = new Date().toISOString();
        const targetEmail = req.user?.email || 'optidentt@gmail.com';

        // Actively dispatch invites to targetEmail for upcoming appointments
        let sentCount = 0;
        for (const appt of incoming.slice(0, 10)) {
            try {
                await sendAppointmentNotificationEmail(targetEmail, appt.patient_name || 'Patient', {
                    service_name: appt.service_name || 'Dental Consultation',
                    doctor_name: appt.doctor_name || 'Dr. Maria Santos',
                    date: appt.appointment_date || appt.date || '',
                    time: appt.appointment_time || appt.time_slot || appt.time || '09:00 AM',
                    id: String(appt._id)
                }, 'booked');
                sentCount++;
            } catch (err) {
                console.warn('[Sync Calendar] Failed dispatching for apt', appt._id, err.message);
            }
        }

        // Persist sync timestamp in settings
        await dbClient.updateOne('system_settings', { setting_type: 'clinic_profile' }, {
            $set: {
                'integrations.google_calendar_last_sync': now,
                'integrations.google_calendar_synced_count': incoming.length,
                'integrations.google_calendar_target_email': targetEmail
            }
        });

        await logAudit(req, 'SYNC_GOOGLE_CALENDAR', 'ADMIN', {
            target_email: targetEmail,
            synced_count: incoming.length,
            sent_count: sentCount,
            timestamp: now
        }, 'success');

        return res.status(200).json({
            status: 'success',
            message: `Successfully synchronized ${incoming.length} incoming appointment(s) with Google Calendar (${targetEmail})!`,
            synced_count: incoming.length,
            target_email: targetEmail,
            last_sync: now,
            google_calendar_url: 'https://calendar.google.com/calendar/u/0/r'
        });
    } catch (err) {
        console.error('Sync Google calendar error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to execute Google Calendar sync.' });
    }
};

router.post('/sync_google_calendar', handleGoogleCalendarSync);
router.post('/sync_google_calendar_now', handleGoogleCalendarSync);

/**
 * Generate iCalendar RFC 5545 feed of all incoming clinic appointments
 */
router.get('/google_calendar_feed', async (req, res) => {
    try {
        const allAppts = await dbClient.find('appointments', {});
        const todayIso = new Date().toISOString().slice(0, 10);

        const incoming = allAppts.filter(a => {
            if (a.is_deleted || a.is_archived) return false;
            const status = (a.status || '').toLowerCase();
            const isIncomingStatus = status === 'scheduled' || status === 'confirmed' || status === 'in_treatment';
            return isIncomingStatus && (a.appointment_date || a.date || '') >= todayIso;
        });

        let ics = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//OptiDent Clinic//Google Calendar Sync//EN',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'X-WR-CALNAME:OptiDent Clinic Appointments',
            'X-WR-TIMEZONE:Asia/Manila',
            'BEGIN:VTIMEZONE',
            'TZID:Asia/Manila',
            'X-LIC-LOCATION:Asia/Manila',
            'BEGIN:STANDARD',
            'TZOFFSETFROM:+0800',
            'TZOFFSETTO:+0800',
            'TZNAME:PST',
            'DTSTART:19700101T000000',
            'END:STANDARD',
            'END:VTIMEZONE'
        ];

        for (const apt of incoming) {
            const dateStr = (apt.appointment_date || apt.date || '').replace(/-/g, '');
            const timeStr = (apt.appointment_time || apt.time_slot || apt.time || '09:00 AM');
            let hour = 9, min = 0;
            const tMatch = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
            if (tMatch) {
                hour = parseInt(tMatch[1], 10);
                min = parseInt(tMatch[2], 10);
                const ampm = (tMatch[3] || '').toUpperCase();
                if (ampm === 'PM' && hour < 12) hour += 12;
                if (ampm === 'AM' && hour === 12) hour = 0;
            }
            const dtStart = `${dateStr}T${String(hour).padStart(2, '0')}${String(min).padStart(2, '0')}00`;
            const endHour = hour + 1;
            const dtEnd = `${dateStr}T${String(endHour).padStart(2, '0')}${String(min).padStart(2, '0')}00`;

            ics.push('BEGIN:VEVENT');
            ics.push(`UID:OPT-GCAL-${String(apt._id)}@optident.clinic`);
            ics.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`);
            ics.push(`DTSTART;TZID=Asia/Manila:${dtStart}`);
            ics.push(`DTEND;TZID=Asia/Manila:${dtEnd}`);
            ics.push(`SUMMARY:Dental: ${apt.service_name || 'Appointment'} - ${apt.patient_name || 'Patient'}`);
            ics.push(`DESCRIPTION:Patient: ${apt.patient_name || 'Patient'}\\nDoctor: ${apt.doctor_name || 'Attending Dentist'}\\nService: ${apt.service_name || 'Dental Service'}\\nOperatory: ${apt.operatory_chair || 'Chair 1'}`);
            ics.push(`LOCATION:OptiDent Dental Care Clinic, Manila`);
            ics.push('STATUS:CONFIRMED');
            ics.push('END:VEVENT');
        }

        ics.push('END:VCALENDAR');

        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="optident_incoming_appointments.ics"');
        return res.send(ics.join('\r\n'));
    } catch (err) {
        console.error('Calendar feed error:', err);
        return res.status(500).send('Error generating calendar feed.');
    }
});

/**
 * SA-006: Soft-Deleted Records (Data Recovery Vault)
 */
router.get('/get_deleted_records', async (req, res) => {
    try {
        const filter = (req.query.collection || 'all').toLowerCase();
        const items = [];

        // 1. Soft-deleted users
        if (filter === 'all' || filter === 'users') {
            const users = await dbClient.find('users', {
                $or: [{ is_deleted: true }, { status: 'deleted' }]
            });
            for (const u of users) {
                items.push({
                    id: String(u._id),
                    collection: 'users',
                    type: 'user',
                    title: u.full_name ? `${u.full_name} (${u.role || 'user'})` : (u.name || u.email || 'User Account'),
                    identifier: u.email || String(u._id),
                    role: u.role || 'user',
                    deleted_at: u.deleted_at || u.updated_at || '',
                    deleted_by: u.deleted_by || 'Super Admin',
                    deleted_reason: u.delete_reason || u.deleted_reason || 'Deactivated by Administrator',
                    can_purge: !u.is_master && u.role !== 'super_admin' && u.email !== 'optidentt@gmail.com'
                });
            }
        }

        // 2. Soft-deleted / cancelled staff invitations
        if (filter === 'all' || filter === 'invitations') {
            const invitations = await dbClient.find('invitations', {
                $or: [{ is_deleted: true }, { status: 'cancelled' }, { status: 'revoked' }, { status: 'deleted' }]
            });
            for (const inv of invitations) {
                items.push({
                    id: String(inv._id),
                    collection: 'invitations',
                    type: 'invitation',
                    title: `Staff Invite: ${inv.email} (${inv.role || 'Staff'})`,
                    identifier: inv.email,
                    role: inv.role || 'Staff',
                    deleted_at: inv.cancelled_at || inv.deleted_at || inv.created_at || '',
                    deleted_by: inv.cancelled_by || inv.deleted_by || 'Super Admin',
                    deleted_reason: inv.cancel_reason || inv.deleted_reason || 'Invitation revoked / cancelled',
                    can_purge: true
                });
            }
        }

        // 3. Soft-deleted appointments
        if (filter === 'all' || filter === 'appointments') {
            const appts = await dbClient.find('appointments', {
                $or: [{ is_deleted: true }, { status: 'cancelled' }]
            });
            for (const a of appts) {
                items.push({
                    id: String(a._id),
                    collection: 'appointments',
                    type: 'appointment',
                    title: `${a.patient_name || 'Patient'} - ${a.service_name || 'Dental Procedure'}`,
                    identifier: a.appointment_code || a.patient_phone || a.patient_email || (a.date ? `${a.date} ${a.time || ''}` : String(a._id)),
                    role: 'patient',
                    deleted_at: a.deleted_at || a.cancelled_at || a.updated_at || '',
                    deleted_by: a.deleted_by || a.cancelled_by || 'Staff / Client',
                    deleted_reason: a.cancellation_reason || a.delete_reason || 'Appointment cancelled / removed',
                    can_purge: true
                });
            }
        }

        // Sort latest deleted first
        items.sort((a, b) => (b.deleted_at || '').localeCompare(a.deleted_at || ''));

        return res.status(200).json({
            status: 'success',
            items: items,
            records: items,
            total: items.length
        });
    } catch (err) {
        console.error('Deleted records error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to retrieve deleted records: ' + err.message });
    }
});

/**
 * Restore Record
 */
router.post('/restore_record', async (req, res) => {
    try {
        const { id, type, collection, identifier } = req.body;
        if (!id && !identifier) return res.status(400).json({ status: 'error', message: 'Record ID or Identifier is required.' });

        const col = collection || (type === 'appointment' ? 'appointments' : (type === 'invitation' ? 'invitations' : 'users'));
        const query = id ? { _id: id } : { email: identifier };

        if (col === 'users') {
            await dbClient.updateOne('users', query, {
                $set: { is_deleted: false, status: 'active', updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19) },
                $unset: { deleted_at: "", deleted_by: "", delete_reason: "" }
            });
        } else if (col === 'invitations') {
            await dbClient.updateOne('invitations', query, {
                $set: { is_deleted: false, status: 'pending', updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19) },
                $unset: { cancelled_at: "", cancelled_by: "", cancel_reason: "" }
            });
        } else if (col === 'appointments') {
            await dbClient.updateOne('appointments', query, {
                $set: { is_deleted: false, status: 'scheduled', updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19) },
                $unset: { deleted_at: "", deleted_by: "", cancellation_reason: "" }
            });
        }

        await logAudit(req, 'RESTORE_RECORD', 'ADMIN', { id, identifier, collection: col }, 'success');
        return res.status(200).json({ status: 'success', message: 'Record restored successfully back to active status.' });
    } catch (err) {
        console.error('Restore error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to restore record: ' + err.message });
    }
});

/**
 * SA-007: Archive & Unarchive
 */
router.get('/get_archived_records', async (req, res) => {
    try {
        const appts = await dbClient.find('appointments', { is_archived: true });
        return res.status(200).json({ status: 'success', records: appts });
    } catch (err) {
        return res.status(500).json({ status: 'error', message: 'Failed to load archived records.' });
    }
});

router.post('/archive_record', async (req, res) => {
    try {
        const { id } = req.body;
        await dbClient.updateOne('appointments', { _id: id }, {
            $set: { is_archived: true, archived_at: new Date().toISOString() }
        });
        return res.status(200).json({ status: 'success', message: 'Record archived.' });
    } catch (err) {
        return res.status(500).json({ status: 'error', message: 'Failed to archive record.' });
    }
});

router.post('/unarchive_record', async (req, res) => {
    try {
        const { id } = req.body;
        await dbClient.updateOne('appointments', { _id: id }, {
            $set: { is_archived: false, updated_at: new Date().toISOString() }
        });
        return res.status(200).json({ status: 'success', message: 'Record restored from archive.' });
    } catch (err) {
        return res.status(500).json({ status: 'error', message: 'Failed to unarchive record.' });
    }
});

/**
 * Reports Data (SA-009)
 */
router.get('/get_reports_data', async (req, res) => {
    try {
        const category = (req.query.category || 'all').toLowerCase();
        const datePreset = (req.query.date_preset || 'all_time').toLowerCase();
        const customFrom = req.query.date_from || '';
        const customTo = req.query.date_to || '';
        const filterDoc = req.query.doctor || 'all';
        const filterStat = (req.query.status || 'all').toLowerCase();

        const now = new Date();
        const manilaOffset = 8 * 60; // Manila is UTC+8
        const localNow = new Date(now.getTime() + (now.getTimezoneOffset() + manilaOffset) * 60000);
        const todayStr = localNow.toISOString().slice(0, 10);
        let startDate = null;
        let endDate = null;

        if (datePreset === 'today') {
            startDate = todayStr;
            endDate = todayStr;
        } else if (datePreset === 'yesterday') {
            const d = new Date(localNow);
            d.setDate(d.getDate() - 1);
            startDate = d.toISOString().slice(0, 10);
            endDate = startDate;
        } else if (datePreset === 'this_week') {
            const d = new Date(localNow);
            const day = d.getDay();
            const diff = d.getDate() - day + (day === 0 ? -6 : 1);
            d.setDate(diff);
            startDate = d.toISOString().slice(0, 10);
            endDate = todayStr;
        } else if (datePreset === 'this_month') {
            startDate = todayStr.slice(0, 7) + '-01';
            endDate = todayStr;
        } else if (datePreset === 'last_30_days') {
            const d = new Date(localNow);
            d.setDate(d.getDate() - 30);
            startDate = d.toISOString().slice(0, 10);
            endDate = todayStr;
        } else if (datePreset === 'custom' && customFrom) {
            startDate = customFrom;
            endDate = customTo || todayStr;
        }

        const allUsers = await dbClient.find('users', { is_deleted: { $ne: true } });
        const allAppts = await dbClient.find('appointments', { is_deleted: { $ne: true } });
        const allAudit = await dbClient.find('audit_logs', {});

        const doctorsList = [];
        const allPatients = [];

        for (const u of allUsers) {
            const role = (u.role || '').toLowerCase();
            if (role === 'doctor') {
                doctorsList.push({
                    id: String(u._id),
                    name: u.full_name || 'Doctor',
                    specialization: u.specialization || 'General Dentistry'
                });
            } else if (['patient', 'client'].includes(role) || !role) {
                allPatients.push({
                    id: String(u._id),
                    full_name: u.full_name || 'Patient',
                    email: u.email || '',
                    phone: u.phone || 'N/A',
                    age: u.age || 'N/A',
                    gender: u.gender || 'Other',
                    medical_alerts: u.allergies || u.medical_alerts || 'None recorded',
                    status: u.status || 'active',
                    created_at: u.created_at || ''
                });
            }
        }

        const filteredAppts = [];
        let completedCount = 0;
        let inProgressCount = 0;
        let scheduledCount = 0;
        let cancelledCount = 0;
        let walkinCount = 0;
        let totalRevenue = 0;
        let completedRevenue = 0;
        let scheduledRevenue = 0;
        const todayQueue = [];
        const cancellationsList = [];

        for (const apt of allAppts) {
            const aptDate = (apt.appointment_date || apt.date || apt.created_at || '').slice(0, 10);
            const status = (apt.status || 'scheduled').toLowerCase();
            const docName = apt.doctor_name || apt.attending_doctor || 'Doctor';

            if (startDate && endDate && (aptDate < startDate || aptDate > endDate)) continue;
            if (filterDoc !== 'all' && docName.toLowerCase() !== filterDoc.toLowerCase()) continue;

            const isStatusMatch = filterStat === 'all' ||
                (filterStat === 'completed' && status === 'completed') ||
                (filterStat === 'scheduled' && status === 'scheduled') ||
                (filterStat === 'in_progress' && ['in_progress', 'in_chair', 'ongoing', 'checked_in'].includes(status)) ||
                (filterStat === 'cancelled' && ['cancelled', 'no-show', 'noshow'].includes(status)) ||
                status === filterStat;

            if (category === 'cancellations') {
                if (!['cancelled', 'no-show', 'noshow'].includes(status)) continue;
            } else {
                if (!isStatusMatch) continue;
            }

            const price = apt.price !== undefined && apt.price !== null && !isNaN(Number(apt.price))
                ? Number(apt.price)
                : getServicePrice(apt.service_name);

            const apptItem = {
                id: String(apt._id),
                patient_name: apt.patient_name || 'Patient',
                patient_phone: apt.patient_phone || '',
                patient_email: apt.patient_email || '',
                doctor_name: docName,
                service_name: apt.service_name || 'Consultation',
                appointment_date: aptDate,
                appointment_time: apt.appointment_time || apt.time_slot || '09:00 AM',
                operatory_chair: apt.operatory_chair || 'Chair 1',
                status: status,
                price: price,
                formatted_price: formatPhp(price),
                is_walkin: !!apt.is_walkin
            };

            filteredAppts.push(apptItem);

            totalRevenue += price;
            if (status === 'completed') {
                completedCount++;
                completedRevenue += price;
            } else if (['in_progress', 'in_chair', 'ongoing'].includes(status)) {
                inProgressCount++;
                completedRevenue += price;
            } else if (status === 'scheduled') {
                scheduledCount++;
                scheduledRevenue += price;
            } else if (status === 'cancelled') {
                cancelledCount++;
                cancellationsList.push({
                    id: String(apt._id),
                    patient_name: apt.patient_name || 'Patient',
                    doctor_name: docName,
                    appointment_date: aptDate,
                    price: price,
                    formatted_price: formatPhp(price),
                    cancellation_reason: apt.cancellation_reason || 'Patient cancelled'
                });
            }

            if (apt.is_walkin) walkinCount++;
            if (aptDate === todayStr) {
                todayQueue.push(apptItem);
            }
        }

        const totalApptsInPeriod = filteredAppts.length;
        const completionRate = totalApptsInPeriod > 0 ? Math.round((completedCount / totalApptsInPeriod) * 100) : 0;
        const cancellationRate = totalApptsInPeriod > 0 ? Math.round((cancelledCount / totalApptsInPeriod) * 100) : 0;

        const auditFormatted = allAudit.map(a => ({
            id: String(a._id),
            action: a.action || 'SYSTEM_EVENT',
            target: a.category || 'system',
            actor_name: a.user_email || 'System',
            actor_role: a.user_role || 'admin',
            ip_address: a.ip_address || '127.0.0.1',
            created_at: a.created_at || ''
        }));

        const securityCount = allAudit.filter(a => {
            const act = (a.action || '').toUpperCase();
            return act.includes('LOGIN') || act.includes('PASSWORD') || act.includes('ROLE');
        }).length;

        return res.status(200).json({
            status: 'success',
            metrics: {
                total_patients: allPatients.length,
                total_appointments: totalApptsInPeriod,
                completed_count: completedCount,
                in_progress_count: inProgressCount,
                scheduled_count: scheduledCount,
                cancelled_count: cancelledCount,
                walkin_count: walkinCount,
                completion_rate: completionRate,
                cancellation_rate: cancellationRate,
                today_queue_count: todayQueue.length,
                audit_events_count: allAudit.length,
                security_events_count: securityCount,
                total_revenue: totalRevenue,
                formatted_total_revenue: formatPhp(totalRevenue),
                completed_revenue: completedRevenue,
                formatted_completed_revenue: formatPhp(completedRevenue),
                scheduled_revenue: scheduledRevenue,
                formatted_scheduled_revenue: formatPhp(scheduledRevenue)
            },
            data: {
                earnings: filteredAppts,
                appointments: filteredAppts.slice(0, 100),
                patients: allPatients.slice(0, 100),
                queues: todayQueue.slice(0, 50),
                cancellations: cancellationsList.slice(0, 50),
                audit_logs: auditFormatted.slice(0, 80)
            },
            filters_options: {
                doctors: doctorsList
            }
        });
    } catch (err) {
        console.error('Reports error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to generate report.' });
    }
});

/**
 * Export Reports to RFC 4180 CSV with UTF-8 BOM (SA-009)
 */
router.get('/export_csv', async (req, res) => {
    try {
        const type = (req.query.type || req.query.category || req.query.report || 'earnings').toLowerCase();
        const datePreset = (req.query.date_preset || 'all_time').toLowerCase();
        const customFrom = req.query.date_from || '';
        const customTo = req.query.date_to || '';
        const filterDoc = req.query.doctor || 'all';
        const filterStat = (req.query.status || 'all').toLowerCase();

        const todayStr = new Date().toISOString().slice(0, 10);
        let startDate = null;
        let endDate = null;

        if (datePreset === 'today') {
            startDate = todayStr; endDate = todayStr;
        } else if (datePreset === 'yesterday') {
            const d = new Date(); d.setDate(d.getDate() - 1);
            startDate = d.toISOString().slice(0, 10); endDate = startDate;
        } else if (datePreset === 'this_week') {
            const d = new Date();
            const day = d.getDay();
            const diff = d.getDate() - day + (day === 0 ? -6 : 1);
            d.setDate(diff);
            startDate = d.toISOString().slice(0, 10);
            endDate = todayStr;
        } else if (datePreset === 'this_month') {
            startDate = todayStr.slice(0, 7) + '-01';
            endDate = todayStr;
        } else if (datePreset === 'last_30_days') {
            const d = new Date(); d.setDate(d.getDate() - 30);
            startDate = d.toISOString().slice(0, 10); endDate = todayStr;
        } else if (datePreset === 'custom' && customFrom) {
            startDate = customFrom; endDate = customTo || todayStr;
        }

        const allAppts = await dbClient.find('appointments', { is_deleted: { $ne: true } });
        const allUsers = await dbClient.find('users', { is_deleted: { $ne: true } });
        const allAudit = await dbClient.find('audit_logs', {});

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `optident_${type}_report_${timestamp}.csv`;

        res.setHeader('Content-Type', 'text/csv; charset=UTF-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        const escapeCsv = (val) => {
            if (val === null || val === undefined) return '""';
            const str = String(val).replace(/"/g, '""');
            return `"${str}"`;
        };

        let csv = '\uFEFF'; // UTF-8 BOM for Excel

        if (type === 'earnings') {
            csv += `OptiDent Dental Clinic - Full Financial & System Earnings Report (SA-009)\n`;
            csv += `Generated On:,${new Date().toLocaleString()},Exported By:,${req.user?.email || 'Super Admin'}\n`;
            csv += `Period:,${datePreset},Date Range:,${startDate || 'All Time'} to ${endDate || 'Present'}\n`;
            csv += `Doctor Filter:,${filterDoc},Status Filter:,${filterStat}\n\n`;

            csv += ['Appointment ID', 'Date', 'Time Slot', 'Patient Name', 'Contact Phone', 'Patient Email', 'Treatment / Procedure', 'Attending Doctor', 'Operatory Chair', 'Status', 'Price / Fee (PHP)'].map(escapeCsv).join(',') + '\n';

            let totalCompletedRevenue = 0;
            let totalScheduledRevenue = 0;
            let totalOverallRevenue = 0;
            let matchCount = 0;

            for (const a of allAppts) {
                const aptDate = (a.appointment_date || a.date || a.created_at || '').slice(0, 10);
                const status = (a.status || 'scheduled').toLowerCase();
                const docName = a.doctor_name || a.attending_doctor || 'Doctor';

                if (startDate && endDate && (aptDate < startDate || aptDate > endDate)) continue;
                if (filterDoc !== 'all' && docName.toLowerCase() !== filterDoc.toLowerCase()) continue;
                if (filterStat !== 'all' && status !== filterStat) continue;

                const price = a.price !== undefined && a.price !== null && !isNaN(Number(a.price))
                    ? Number(a.price)
                    : getServicePrice(a.service_name);

                totalOverallRevenue += price;
                if (status === 'completed') totalCompletedRevenue += price;
                else if (status === 'scheduled') totalScheduledRevenue += price;
                matchCount++;

                csv += [
                    String(a._id),
                    aptDate,
                    a.appointment_time || a.time_slot || '09:00 AM',
                    a.patient_name || 'Patient',
                    a.patient_phone || '',
                    a.patient_email || '',
                    a.service_name || 'Consultation',
                    docName,
                    a.operatory_chair || 'Chair 1',
                    status.toUpperCase(),
                    price.toFixed(2)
                ].map(escapeCsv).join(',') + '\n';
            }

            csv += `\n`;
            csv += `FINANCIAL REVENUE SUMMARY\n`;
            csv += `Total Records Count:,${matchCount}\n`;
            csv += `Total Realized Earnings (Completed Treatments):,PHP ${totalCompletedRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
            csv += `Total Projected Revenue (Scheduled Appointments):,PHP ${totalScheduledRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
            csv += `Total System Revenue (Overall):,PHP ${totalOverallRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;

        } else if (type === 'patients') {
            csv += ['Patient ID', 'Full Name', 'Email Address', 'Phone Number', 'Gender', 'Age', 'Medical Alerts', 'Account Status', 'Registered Date'].map(escapeCsv).join(',') + '\n';
            for (const u of allUsers) {
                const role = (u.role || '').toLowerCase();
                if (['patient', 'client'].includes(role) || !role) {
                    const createdAt = (u.created_at || '').slice(0, 10);
                    if (startDate && endDate && (createdAt < startDate || createdAt > endDate)) continue;
                    csv += [
                        String(u._id),
                        u.full_name || 'Patient',
                        u.email || '',
                        u.phone || 'N/A',
                        u.gender || 'Other',
                        u.age || 'N/A',
                        u.medical_alerts || u.allergies || 'None',
                        u.status || 'active',
                        u.created_at || ''
                    ].map(escapeCsv).join(',') + '\n';
                }
            }
        } else if (type === 'queues') {
            csv += ['Queue Number', 'Appointment Date', 'Time Slot', 'Patient Name', 'Phone', 'Service / Procedure', 'Attending Doctor', 'Operatory Chair', 'Queue Status', 'Walk-in?'].map(escapeCsv).join(',') + '\n';
            for (const a of allAppts) {
                const aptDate = (a.appointment_date || a.date || '').slice(0, 10);
                if (startDate && endDate && (aptDate < startDate || aptDate > endDate)) continue;
                csv += [
                    a.queue_number || 'N/A',
                    aptDate,
                    a.appointment_time || a.time_slot || '09:00 AM',
                    a.patient_name || 'Patient',
                    a.patient_phone || '',
                    a.service_name || 'Consultation',
                    a.doctor_name || 'Doctor',
                    a.operatory_chair || 'Chair 1',
                    (a.status || 'scheduled').toUpperCase(),
                    a.is_walkin ? 'YES' : 'NO'
                ].map(escapeCsv).join(',') + '\n';
            }
        } else if (type === 'cancellations') {
            csv += ['Appointment ID', 'Date', 'Time Slot', 'Patient Name', 'Phone', 'Service', 'Attending Doctor', 'Cancellation Reason', 'Cancelled At'].map(escapeCsv).join(',') + '\n';
            for (const a of allAppts) {
                if ((a.status || '').toLowerCase() !== 'cancelled') continue;
                const aptDate = (a.appointment_date || a.date || '').slice(0, 10);
                if (startDate && endDate && (aptDate < startDate || aptDate > endDate)) continue;
                csv += [
                    String(a._id),
                    aptDate,
                    a.appointment_time || a.time_slot || '09:00 AM',
                    a.patient_name || 'Patient',
                    a.patient_phone || '',
                    a.service_name || 'Consultation',
                    a.doctor_name || 'Doctor',
                    a.cancellation_reason || 'Patient cancelled',
                    a.cancelled_at || a.updated_at || 'N/A'
                ].map(escapeCsv).join(',') + '\n';
            }
        } else if (type === 'audit_logs') {
            csv += ['Event ID', 'Timestamp', 'Action / Event Type', 'Target Entity', 'IP Address', 'User Role', 'Actor'].map(escapeCsv).join(',') + '\n';
            for (const log of allAudit) {
                const logDate = (log.created_at || '').slice(0, 10);
                if (startDate && endDate && (logDate < startDate || logDate > endDate)) continue;
                csv += [
                    String(log._id),
                    log.created_at || '',
                    log.action || 'SYSTEM_EVENT',
                    log.category || 'system',
                    log.ip_address || '127.0.0.1',
                    log.user_role || 'admin',
                    log.user_email || 'System'
                ].map(escapeCsv).join(',') + '\n';
            }
        } else {
            // Default Appointments
            csv += ['Appointment ID', 'Date', 'Time Slot', 'Patient Name', 'Email', 'Phone', 'Service / Procedure', 'Attending Doctor', 'Operatory Chair', 'Price (PHP)', 'Status', 'Walk-in?'].map(escapeCsv).join(',') + '\n';
            for (const a of allAppts) {
                const aptDate = (a.appointment_date || a.date || '').slice(0, 10);
                const status = (a.status || 'scheduled').toLowerCase();
                const docName = a.doctor_name || a.attending_doctor || 'Doctor';

                if (startDate && endDate && (aptDate < startDate || aptDate > endDate)) continue;
                if (filterDoc !== 'all' && docName.toLowerCase() !== filterDoc.toLowerCase()) continue;
                if (filterStat !== 'all' && status !== filterStat) continue;

                const price = a.price !== undefined && a.price !== null && !isNaN(Number(a.price))
                    ? Number(a.price)
                    : getServicePrice(a.service_name);

                csv += [
                    String(a._id),
                    aptDate,
                    a.appointment_time || a.time_slot || '09:00 AM',
                    a.patient_name || 'Patient',
                    a.patient_email || '',
                    a.patient_phone || '',
                    a.service_name || 'Consultation',
                    docName,
                    a.operatory_chair || 'Chair 1',
                    price.toFixed(2),
                    status.toUpperCase(),
                    a.is_walkin ? 'YES' : 'NO'
                ].map(escapeCsv).join(',') + '\n';
            }
        }

        await logAudit(req, 'EXPORT_REPORTS_CSV', 'ADMIN', { type, datePreset }, 'success');
        return res.send(csv);

    } catch (err) {
        console.error('Export CSV error:', err);
        return res.status(500).send('Error generating CSV export.');
    }
});

/**
 * Export Official Printable PDF Report (SA-009)
 */
router.get('/export_pdf', async (req, res) => {
    try {
        const report = (req.query.report || 'comprehensive').toLowerCase();
        const datePreset = (req.query.date_preset || 'all_time').toLowerCase();
        const customFrom = req.query.date_from || '';
        const customTo = req.query.date_to || '';
        const filterDoc = req.query.doctor || 'all';
        const filterStat = (req.query.status || 'all').toLowerCase();

        const todayStr = new Date().toISOString().slice(0, 10);
        let startDate = null;
        let endDate = null;

        if (datePreset === 'today') {
            startDate = todayStr; endDate = todayStr;
        } else if (datePreset === 'yesterday') {
            const d = new Date(); d.setDate(d.getDate() - 1);
            startDate = d.toISOString().slice(0, 10); endDate = startDate;
        } else if (datePreset === 'this_week') {
            const d = new Date();
            const day = d.getDay();
            const diff = d.getDate() - day + (day === 0 ? -6 : 1);
            d.setDate(diff);
            startDate = d.toISOString().slice(0, 10);
            endDate = todayStr;
        } else if (datePreset === 'this_month') {
            startDate = todayStr.slice(0, 7) + '-01'; endDate = todayStr;
        } else if (datePreset === 'last_30_days') {
            const d = new Date(); d.setDate(d.getDate() - 30);
            startDate = d.toISOString().slice(0, 10); endDate = todayStr;
        } else if (datePreset === 'custom' && customFrom) {
            startDate = customFrom; endDate = customTo || todayStr;
        }

        const allAppts = await dbClient.find('appointments', { is_deleted: { $ne: true } });
        const allUsers = await dbClient.find('users', { is_deleted: { $ne: true } });

        let totalCompleted = 0;
        let totalRevenue = 0;
        let completedRevenue = 0;
        const matchingAppts = [];

        for (const a of allAppts) {
            const aptDate = (a.appointment_date || a.date || a.created_at || '').slice(0, 10);
            const status = (a.status || 'scheduled').toLowerCase();
            const docName = a.doctor_name || a.attending_doctor || 'Doctor';

            if (startDate && endDate && (aptDate < startDate || aptDate > endDate)) continue;
            if (filterDoc !== 'all' && docName.toLowerCase() !== filterDoc.toLowerCase()) continue;

            const isStatusMatch = filterStat === 'all' ||
                (filterStat === 'completed' && status === 'completed') ||
                (filterStat === 'scheduled' && status === 'scheduled') ||
                (filterStat === 'in_progress' && ['in_progress', 'in_chair', 'ongoing', 'checked_in'].includes(status)) ||
                (filterStat === 'cancelled' && ['cancelled', 'no-show', 'noshow'].includes(status)) ||
                status === filterStat;

            if (category === 'cancellations') {
                if (!['cancelled', 'no-show', 'noshow'].includes(status)) continue;
            } else {
                if (!isStatusMatch) continue;
            }

            const price = a.price !== undefined && a.price !== null && !isNaN(Number(a.price))
                ? Number(a.price)
                : getServicePrice(a.service_name);

            totalRevenue += price;
            if (status === 'completed') {
                totalCompleted++;
                completedRevenue += price;
            }

            matchingAppts.push({ ...a, resolvedPrice: price });
        }

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>OptiDent Operations & Financial Report (SA-009)</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; padding: 24px; color: #1e293b; background: #fff; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0eb1b1; padding-bottom: 12px; margin-bottom: 18px; }
        .logo-title { font-size: 24px; font-weight: 800; color: #0eb1b1; margin: 0; }
        .subtitle { font-size: 11px; text-transform: uppercase; color: #64748b; letter-spacing: 1.5px; margin-top: 2px; }
        .meta-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 18px; font-size: 12px; }
        .metrics-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
        .metric-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; border-top: 3px solid #0eb1b1; }
        .metric-card.green { border-top-color: #10b981; }
        .metric-val { font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 4px; }
        .metric-label { font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 700; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px; }
        th { background: #f1f5f9; padding: 8px 10px; text-align: left; font-weight: 700; border-bottom: 2px solid #cbd5e1; font-size: 11px; text-transform: uppercase; }
        td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
        .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; }
        .status-completed { background: #dcfce7; color: #166534; }
        .status-scheduled { background: #fef3c7; color: #92400e; }
        .status-cancelled { background: #fee2e2; color: #991b1b; }
        .footer { font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 12px; margin-top: 24px; }
        @media print {
            .no-print { display: none; }
            body { padding: 0; }
        }
    </style>
</head>
<body>
    <div class="no-print" style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; background: #f0fdf4; border: 1px solid #bbf7d0; padding: 10px 16px; border-radius: 8px;">
        <span style="font-size: 13px; color: #166534; font-weight: 600;">✓ Official Report Ready for Export &amp; Print</span>
        <div>
            <button onclick="window.print()" style="background: #0eb1b1; color: white; border: none; padding: 6px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px;">Print / Save as PDF</button>
            <button onclick="window.close()" style="background: white; border: 1px solid #cbd5e1; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; margin-left: 6px;">Close</button>
        </div>
    </div>

    <div class="header">
        <div>
            <h1 class="logo-title">OptiDent Dental Clinic</h1>
            <div class="subtitle">Operations, Clinical Governance &amp; Financial Earnings Intelligence</div>
        </div>
        <div style="text-align: right; font-size: 11px; color: #64748b;">
            <div>Report ID: SA009-${Date.now().toString().slice(-6)}</div>
            <div>Generated: ${new Date().toLocaleString()}</div>
        </div>
    </div>

    <div class="meta-box">
        <div style="display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
            <div><strong>Reporting Scope:</strong> ${datePreset.toUpperCase().replace(/_/g, ' ')} (${startDate || 'All Time'} to ${endDate || 'Present'})</div>
            <div><strong>Attending Doctor:</strong> ${filterDoc === 'all' ? 'All Clinical Dentists' : filterDoc}</div>
            <div><strong>Status Scope:</strong> ${filterStat === 'all' ? 'All Treatment Statuses' : filterStat.toUpperCase()}</div>
        </div>
    </div>

    <div class="metrics-grid">
        <div class="metric-card green">
            <div class="metric-label">Realized Earnings (Completed)</div>
            <div class="metric-val" style="color: #059669;">₱${completedRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
        </div>
        <div class="metric-card">
            <div class="metric-label">Total System Revenue</div>
            <div class="metric-val">₱${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
        </div>
        <div class="metric-card">
            <div class="metric-label">Completed Treatments</div>
            <div class="metric-val">${totalCompleted}</div>
        </div>
        <div class="metric-card">
            <div class="metric-label">Total Appointments Analyzed</div>
            <div class="metric-val">${matchingAppts.length}</div>
        </div>
    </div>

    <h3 style="font-size: 14px; margin-bottom: 8px; color: #0f172a;">Itemized Treatment &amp; Earnings Register</h3>
    <table>
        <thead>
            <tr>
                <th>Date &amp; Time</th>
                <th>Patient Details</th>
                <th>Treatment / Procedure</th>
                <th>Attending Doctor</th>
                <th>Price / Fee</th>
                <th style="text-align: right;">Status</th>
            </tr>
        </thead>
        <tbody>
            ${matchingAppts.length === 0 ? '<tr><td colspan="6" style="text-align: center; color: #94a3b8; padding: 20px;">No matching records found for this period.</td></tr>' : matchingAppts.map(a => {
                const st = (a.status || 'scheduled').toLowerCase();
                const badgeClass = st === 'completed' ? 'status-completed' : (st === 'cancelled' ? 'status-cancelled' : 'status-scheduled');
                return `<tr>
                    <td><strong>${a.appointment_date || a.date}</strong><br><span style="color: #64748b; font-size: 11px;">${a.appointment_time || a.time_slot || ''}</span></td>
                    <td><strong>${a.patient_name}</strong><br><span style="color: #64748b; font-size: 11px;">${a.patient_phone || a.patient_email || ''}</span></td>
                    <td><strong>${a.service_name || 'Consultation'}</strong></td>
                    <td>${a.doctor_name || a.attending_doctor || 'Doctor'}</td>
                    <td><strong style="color: #059669;">₱${(a.resolvedPrice || 500).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></td>
                    <td style="text-align: right;"><span class="badge ${badgeClass}">${st.toUpperCase()}</span></td>
                </tr>`;
            }).join('')}
        </tbody>
        <tfoot>
            <tr style="background: #f8fafc; font-weight: bold; border-top: 2px solid #cbd5e1;">
                <td colspan="4" style="text-align: right; padding: 10px;">Total Realized Earnings:</td>
                <td style="color: #059669; font-size: 13px;">₱${completedRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                <td></td>
            </tr>
        </tfoot>
    </table>

    <div class="footer">
        OptiDent Dental Clinic &bull; System Governance &amp; Executive Revenue Reporting &bull; Confidential
    </div>
</body>
</html>`;

        await logAudit(req, 'EXPORT_REPORTS_PDF', 'ADMIN', { report, datePreset }, 'success');
        return res.send(html);

    } catch (err) {
        console.error('Export PDF error:', err);
        return res.status(500).send('Error generating PDF report.');
    }
});

/**
 * SA-002: Invitations Management
 */
router.get('/get_invitations', async (req, res) => {
    try {
        const raw = await dbClient.find('invitations', {});
        const protocol = req.protocol || 'http';
        const host = req.get('host') || 'localhost:3000';
        const baseUrl = `${protocol}://${host}`;

        const list = raw
            .filter(inv => !inv.is_deleted && !inv.is_archived)
            .map(inv => {
                const item = { ...inv };
                if (!item.invite_link) {
                    item.invite_link = `${baseUrl}/accept_invite.html?token=${item.token}`;
                }
                return item;
            });

        list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        return res.status(200).json({ status: 'success', invitations: list });
    } catch (err) {
        console.error('Get invitations error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to retrieve invitations.' });
    }
});

/**
 * Invite Doctor & Receptionist Endpoint
 * Task SA-002: Super Admin Invites Doctor or Receptionist via Email / Token Link
 */
router.post('/invite_user', async (req, res) => {
    try {
        const body = req.body;
        const email = (body.email || '').trim().toLowerCase();
        const role = (body.role || '').trim().toLowerCase();
        const fullName = (body.full_name || '').trim();
        const smtpUser = (body.smtp_user || '').trim();
        const smtpPass = (body.smtp_pass || '').trim();

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ status: 'error', message: 'A valid email address is required.' });
        }

        if (!['doctor', 'receptionist'].includes(role)) {
            return res.status(400).json({ status: 'error', message: "Role must be either 'doctor' or 'receptionist'." });
        }

        // Check if user already exists
        const existingUser = await dbClient.findOne('users', { email });
        if (existingUser) {
            return res.status(409).json({ status: 'error', message: `A user with email ${email} already exists in the system.` });
        }

        const protocol = req.protocol || 'http';
        const host = req.get('host') || 'localhost:3000';
        const baseUrl = `${protocol}://${host}`;

        // Check if there's already an active/pending invitation for this email
        const existingInvite = await dbClient.findOne('invitations', { email, status: 'pending' });
        if (existingInvite) {
            const token = existingInvite.token;
            const inviteLink = `${baseUrl}/accept_invite.html?token=${token}`;
            await dbClient.updateOne('invitations', { _id: existingInvite._id }, { $set: { invite_link: inviteLink } });
            return res.status(200).json({
                status: 'info',
                message: `An active invitation for ${email} already exists.`,
                invite_link: inviteLink,
                token: token,
                role: existingInvite.role
            });
        }

        const token = crypto.randomUUID().replace(/-/g, '') + Date.now().toString(36);
        const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
        const inviteLink = `${baseUrl}/accept_invite.html?token=${token}`;

        const invitationDoc = {
            email,
            role,
            full_name: fullName,
            token,
            status: 'pending',
            invited_by: req.user?.email || 'superadmin@optident.com',
            invite_link: inviteLink,
            expires_at: expiresAt,
            created_at: new Date().toISOString().replace('T', ' ').slice(0, 19)
        };

        const result = await dbClient.insertOne('invitations', invitationDoc);

        // Send real email via mailer
        const emailResult = await sendStaffInvitationEmail(email, fullName, role, inviteLink, smtpUser, smtpPass);

        const roleCap = role.charAt(0).toUpperCase() + role.slice(1);
        const message = `Invitation for ${roleCap} (${email}) created successfully!` +
            (emailResult.sent ? ' Email has been sent to their Gmail!' : ` (Note: ${emailResult.reason || 'SMTP pending'})`);

        await logAudit(req, 'INVITATION_SENT', 'invitations:' + email, {
            email,
            role,
            full_name: fullName,
            email_sent: emailResult.sent
        }, 'success');

        return res.status(201).json({
            status: 'success',
            message,
            email_sent: emailResult.sent,
            email_reason: emailResult.reason || null,
            invitation_id: result.insertedId,
            invite_link: inviteLink,
            token,
            role,
            email,
            expires_at: expiresAt
        });
    } catch (err) {
        console.error('Invite user error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to send invitation.' });
    }
});

/**
 * Cancel / Revoke Staff Invitation
 */
router.post('/cancel_invite', async (req, res) => {
    try {
        const email = (req.body.email || '').trim().toLowerCase();
        const id = req.body.id || req.body.invitation_id;

        const filter = email ? { email } : { _id: id };
        const invitation = await dbClient.findOne('invitations', filter);
        if (!invitation) {
            return res.status(404).json({ status: 'error', message: 'Invitation not found.' });
        }

        await dbClient.updateOne('invitations', filter, {
            $set: {
                is_deleted: true,
                status: 'cancelled',
                deleted_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
                deleted_by: req.user?.email || 'superadmin@optident.com'
            }
        });

        await logAudit(req, 'SOFT_DELETE_INVITATION', 'invitation:' + (invitation.email || email), {
            email: invitation.email,
            role: invitation.role
        }, 'success');

        return res.status(200).json({
            status: 'success',
            message: `Invitation for ${invitation.email} was moved to the Recovery Vault.`
        });
    } catch (err) {
        console.error('Cancel invite error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to cancel invitation.' });
    }
});

/**
 * Resend Staff Invitation Email
 */
router.post('/resend_invite', async (req, res) => {
    try {
        const body = req.body;
        const email = (body.email || '').trim().toLowerCase();
        const id = body.id || body.invitation_id;
        const smtpUser = (body.smtp_user || '').trim();
        const smtpPass = (body.smtp_pass || '').trim();

        const filter = email ? { email, status: 'pending' } : { _id: id, status: 'pending' };
        const invite = await dbClient.findOne('invitations', filter);

        if (!invite) {
            return res.status(404).json({ status: 'error', message: 'Pending invitation not found.' });
        }

        const protocol = req.protocol || 'http';
        const host = req.get('host') || 'localhost:3000';
        const baseUrl = `${protocol}://${host}`;
        const activeInviteLink = `${baseUrl}/accept_invite.html?token=${invite.token}`;

        await dbClient.updateOne('invitations', { _id: invite._id }, {
            $set: { invite_link: activeInviteLink, resent_at: new Date().toISOString() }
        });

        const result = await sendStaffInvitationEmail(invite.email, invite.full_name || '', invite.role, activeInviteLink, smtpUser, smtpPass);

        await logAudit(req, 'RESEND_INVITATION', 'invitations:' + invite.email, {
            email: invite.email,
            role: invite.role,
            email_sent: result.sent
        }, 'success');

        return res.status(200).json({
            status: result.sent ? 'success' : 'info',
            message: result.sent ? `Invitation email resent to ${invite.email}!` : `Email delivery note: ${result.reason || 'SMTP pending'}`,
            email_sent: result.sent,
            invite_link: activeInviteLink
        });
    } catch (err) {
        console.error('Resend invite error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to resend invitation.' });
    }
});

/**
 * System Data & Storage Stats
 */
router.get('/get_system_data_stats', async (req, res) => {
    try {
        const usersCount = await dbClient.countDocuments('users', {});
        const rolesCount = await dbClient.countDocuments('roles_permissions', {});
        const invsCount = await dbClient.countDocuments('invitations', {});
        const settingsCount = await dbClient.countDocuments('system_settings', {});
        const logsCount = await dbClient.countDocuments('audit_logs', {});

        const collectionStats = {
            users: usersCount,
            roles_permissions: rolesCount,
            invitations: invsCount,
            system_settings: settingsCount,
            audit_logs: logsCount
        };

        const totalDocs = Object.values(collectionStats).reduce((a, b) => a + b, 0);

        return res.status(200).json({
            status: 'success',
            stats: {
                storage_mode: dbClient.isNative() ? 'mongodb_native' : 'json_fallback',
                mongo_connected: dbClient.isNative(),
                total_documents: totalDocs,
                collections: collectionStats,
                server_runtime: 'Node.js ' + process.version,
                timezone: 'Asia/Manila',
                server_time: new Date().toISOString().replace('T', ' ').slice(0, 19)
            }
        });
    } catch (err) {
        return res.status(500).json({ status: 'error', message: 'Failed to load stats.' });
    }
});

/**
 * Assign User Role
 */
router.post('/assign_user_role', async (req, res) => {
    try {
        const role = (req.body.role || '').toLowerCase();
        if (!role) return res.status(400).json({ status: 'error', message: 'Role is required.' });

        const query = await resolveUserQuery(req.body);
        if (!query) return res.status(400).json({ status: 'error', message: 'User ID or Email is required.' });

        const targetUser = await dbClient.findOne('users', query);
        if (!targetUser) return res.status(404).json({ status: 'error', message: 'User not found.' });

        await dbClient.updateOne('users', query, {
            $set: { role, updated_at: new Date().toISOString() }
        });

        await logAudit(req, 'ASSIGN_USER_ROLE', 'ADMIN', {
            email: targetUser.email,
            old_role: targetUser.role,
            new_role: role
        }, 'success');

        return res.status(200).json({
            status: 'success',
            message: `Successfully assigned role '${role}' to ${targetUser.email}.`
        });
    } catch (err) {
        console.error('Assign user role error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to assign role.' });
    }
});

/**
 * Purge Record (Permanent Delete)
 */
router.post('/purge_record', async (req, res) => {
    try {
        const { id, type, collection, identifier } = req.body;
        if (!id && !identifier) return res.status(400).json({ status: 'error', message: 'Record ID or Identifier is required.' });

        const col = collection || (type === 'appointment' ? 'appointments' : (type === 'invitation' ? 'invitations' : 'users'));
        
        // Prevent purging root super admin or master
        if (col === 'users') {
            const user = await dbClient.findOne('users', id ? { _id: id } : { email: identifier });
            if (user && (user.is_master || user.role === 'super_admin' || user.email === 'optidentt@gmail.com')) {
                return res.status(403).json({ status: 'error', message: 'Super Administrator accounts cannot be permanently purged.' });
            }
        }

        const query = id ? { _id: id } : { email: identifier };
        await dbClient.deleteOne(col, query);
        await logAudit(req, 'PURGE_RECORD', 'ADMIN', { id, identifier, collection: col }, 'success');
        return res.status(200).json({ status: 'success', message: 'Record permanently purged from database.' });
    } catch (err) {
        console.error('Purge error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to purge record: ' + err.message });
    }
});

/**
 * SA-007: Batch Archive Automation
 */
router.post('/batch_archive', async (req, res) => {
    try {
        const body = req.body;
        const rule = (body.rule || 'completed_appointments_30d').trim();
        const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

        let archivedCount = 0;
        let ruleLabel = '';

        if (rule === 'completed_appointments_30d' || rule === 'completed_appointments_60d') {
            const days = (rule === 'completed_appointments_60d') ? 60 : 30;
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
            const cutoffStr = cutoffDate.toISOString().slice(0, 10);

            const allAppts = await dbClient.find('appointments', {});
            for (const appt of allAppts) {
                if (appt.is_archived) continue;
                const status = (appt.status || '').toLowerCase();
                if (!['completed', 'cancelled', 'no-show'].includes(status)) continue;

                const apptDate = (appt.appointment_date || appt.date || '').slice(0, 10);
                if (apptDate <= cutoffStr) {
                    await dbClient.updateOne('appointments', { _id: appt._id }, {
                        $set: {
                            is_archived: true,
                            archived_at: now,
                            archived_by: req.user.email,
                            archive_reason: `Automated policy: ${status} appointment older than ${days} days`
                        }
                    });
                    archivedCount++;
                }
            }
            ruleLabel = `Completed Appointments older than ${days} days`;
        } else if (rule === 'expired_invitations') {
            const invitations = await dbClient.find('invitations', {});
            for (const inv of invitations) {
                if (inv.is_archived || inv.is_deleted) continue;
                const status = (inv.status || 'pending').toLowerCase();
                const expiresAt = inv.expires_at || '';
                const isExpired = (expiresAt && new Date(expiresAt).getTime() < Date.now()) || (status === 'expired');

                if (isExpired) {
                    await dbClient.updateOne('invitations', { _id: inv._id }, {
                        $set: {
                            is_archived: true,
                            archived_at: now,
                            archived_by: req.user.email,
                            archive_reason: 'Automated policy: expired staff invitation'
                        }
                    });
                    archivedCount++;
                }
            }
            ruleLabel = 'Expired Staff Invitations';
        } else if (rule === 'inactive_accounts') {
            const users = await dbClient.find('users', {});
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - 90);
            const cutoffStr = cutoff.toISOString().replace('T', ' ').slice(0, 19);

            for (const u of users) {
                if (u.is_master || u.is_archived || u.is_deleted) continue;
                const status = (u.status || 'active').toLowerCase();
                const dt = u.status_updated_at || u.created_at || '';
                if (status === 'suspended' && dt <= cutoffStr) {
                    await dbClient.updateOne('users', { _id: u._id }, {
                        $set: {
                            is_archived: true,
                            archived_at: now,
                            archived_by: req.user.email,
                            archive_reason: 'Automated policy: suspended/inactive account older than 90 days'
                        }
                    });
                    archivedCount++;
                }
            }
            ruleLabel = 'Suspended / Inactive Accounts older than 90 days';
        } else {
            return res.status(400).json({ status: 'error', message: `Unknown batch archival policy '${rule}'.` });
        }

        await logAudit(req, 'BATCH_ARCHIVE_EXECUTED', 'rule:' + rule, {
            rule_label: ruleLabel,
            archived_count: archivedCount
        }, 'success');

        return res.status(200).json({
            status: 'success',
            archived_count: archivedCount,
            rule: rule,
            message: `Batch Archival completed: ${archivedCount} record(s) archived under policy '${ruleLabel}'.`
        });
    } catch (err) {
        console.error('Batch archive error:', err);
        return res.status(500).json({ status: 'error', message: 'Batch archival failed.' });
    }
});

/**
 * Get Email SMTP Config
 */
router.get('/get_email_config', async (req, res) => {
    try {
        const configDoc = await dbClient.findOne('system_settings', { setting_type: 'email_config' });
        const user = configDoc?.smtp_user || process.env.SMTP_USER || 'optidentt@gmail.com';
        const pass = configDoc?.smtp_pass || process.env.SMTP_PASS || 'emuvfyqhuyyafpku';
        return res.status(200).json({
            status: 'success',
            smtp_user: user,
            smtp_host: 'smtp.gmail.com',
            smtp_port: 587,
            is_configured: !!(user && pass)
        });
    } catch (err) {
        return res.status(500).json({ status: 'error', message: 'Failed to retrieve email config.' });
    }
});

/**
 * Save Email SMTP Config
 */
router.post('/save_email_config', async (req, res) => {
    try {
        const { smtp_user, smtp_pass } = req.body;
        if (!smtp_user || !smtp_pass) {
            return res.status(400).json({ status: 'error', message: 'Both Gmail address and App Password are required.' });
        }

        await dbClient.updateOne('system_settings', { setting_type: 'email_config' }, {
            $set: {
                setting_type: 'email_config',
                smtp_user: smtp_user.trim(),
                smtp_pass: smtp_pass.replace(/\s+/g, ''),
                smtp_host: 'smtp.gmail.com',
                smtp_port: 587,
                updated_at: new Date().toISOString()
            }
        }, { upsert: true });

        return res.status(200).json({
            status: 'success',
            message: 'Gmail SMTP settings saved successfully! Invitations will now be sent directly to recipients\' Gmail inboxes.',
            smtp_user: smtp_user.trim()
        });
    } catch (err) {
        return res.status(500).json({ status: 'error', message: 'Failed to save email settings.' });
    }
});

/**
 * D-004: Clinical Records API for Super Admin
 */
router.get('/get_clinical_records', async (req, res) => {
    try {
        const query = (req.query.q || '').trim().toLowerCase();
        const category = (req.query.category || '').trim();
        const dateFrom = (req.query.date_from || '').trim();
        const dateTo = (req.query.date_to || '').trim();

        const allCompleted = await dbClient.find('appointments', {
            $or: [
                { status: 'completed' },
                { diagnosis: { $exists: true, $ne: '' } },
                { procedure_notes: { $exists: true, $ne: '' } }
            ]
        });
        const results = [];

        for (const rec of allCompleted) {
            if (rec.is_deleted || rec.is_archived) continue;

            const pName = rec.patient_name || '';
            const diag = rec.diagnosis || '';
            const serv = rec.service_name || '';
            const teeth = Array.isArray(rec.teeth_selected) ? rec.teeth_selected.join(' ') : (rec.teeth_selected || '');
            const cat = rec.treatment_category || 'General Dentistry';
            const date = (rec.appointment_date || rec.date || '').slice(0, 10);

            if (query) {
                const searchCorpus = `${pName} ${diag} ${serv} ${teeth} ${rec.procedure_notes || ''} ${rec.prescription || ''}`.toLowerCase();
                if (!searchCorpus.includes(query)) continue;
            }

            if (category && category !== 'all') {
                if (cat.toLowerCase() !== category.toLowerCase() && !serv.toLowerCase().includes(category.toLowerCase())) {
                    continue;
                }
            }

            if (dateFrom && date < dateFrom) continue;
            if (dateTo && date > dateTo) continue;

            results.push({
                _id: String(rec._id),
                patient_name: pName,
                patient_phone: rec.patient_phone || '',
                patient_email: rec.patient_email || '',
                appointment_date: date,
                appointment_time: rec.time_slot || rec.appointment_time || '',
                service_name: serv,
                treatment_category: cat,
                diagnosis: diag || 'Clinical examination and therapy',
                teeth_selected: Array.isArray(rec.teeth_selected) ? rec.teeth_selected : (rec.teeth_selected ? [rec.teeth_selected] : []),
                tooth_surfaces: Array.isArray(rec.tooth_surfaces) ? rec.tooth_surfaces : [],
                vital_signs: rec.vital_signs || null,
                anesthesia: rec.anesthesia || '',
                procedure_notes: rec.procedure_notes || rec.notes || '',
                prescription: rec.prescription || '',
                follow_up_date: rec.follow_up_date || '',
                post_op_instructions: rec.post_op_instructions || '',
                attending_doctor: rec.attending_doctor || rec.doctor_name || 'Attending Doctor',
                completed_at: rec.completed_at || rec.last_updated_at || date
            });
        }

        results.sort((a, b) => b.appointment_date.localeCompare(a.appointment_date));

        return res.status(200).json({
            status: 'success',
            total: results.length,
            records: results
        });
    } catch (err) {
        console.error('Admin get clinical records error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to fetch clinical records.' });
    }
});

router.post('/save_clinical_record', async (req, res) => {
    try {
        const body = req.body;
        const apptId = body.appointment_id;
        const diagnosis = (body.diagnosis || '').trim();
        const procedureNotes = (body.procedure_notes || body.notes || '').trim();
        const teeth = Array.isArray(body.teeth_selected) ? body.teeth_selected : (body.teeth_selected ? [body.teeth_selected] : []);
        const surfaces = Array.isArray(body.tooth_surfaces) ? body.tooth_surfaces : [];
        const prescription = (body.prescription || '').trim();
        const postOp = (body.post_op_instructions || '').trim();
        const followUp = (body.follow_up_date || '').trim();
        const vitalSigns = body.vital_signs || {};

        if (!apptId && !body.patient_name) {
            return res.status(400).json({ status: 'error', message: 'Appointment ID or patient name is required.' });
        }

        const updateData = {
            diagnosis,
            procedure_notes: procedureNotes,
            notes: procedureNotes,
            treatment_category: body.treatment_category || body.category || 'General Dentistry',
            anesthesia: (body.anesthesia || '').trim(),
            teeth_selected: teeth,
            tooth_surfaces: surfaces,
            prescription,
            post_op_instructions: postOp,
            follow_up_date: followUp,
            vital_signs: vitalSigns,
            status: 'completed',
            completed_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
            completed_by: req.user.full_name || req.user.email
        };

        if (apptId) {
            const existing = await dbClient.findOne('appointments', { _id: apptId });
            if (existing) {
                if (!diagnosis && existing.diagnosis) updateData.diagnosis = existing.diagnosis;
                if (!procedureNotes && (existing.procedure_notes || existing.notes)) updateData.procedure_notes = existing.procedure_notes || existing.notes;
                if (teeth.length === 0 && existing.teeth_selected) updateData.teeth_selected = existing.teeth_selected;
                if (surfaces.length === 0 && existing.tooth_surfaces) updateData.tooth_surfaces = existing.tooth_surfaces;
                if (!prescription && existing.prescription) updateData.prescription = existing.prescription;
                if (!postOp && existing.post_op_instructions) updateData.post_op_instructions = existing.post_op_instructions;
                if (!updateData.anesthesia && existing.anesthesia) updateData.anesthesia = existing.anesthesia;
                if (!body.treatment_category && existing.treatment_category) updateData.treatment_category = existing.treatment_category;
            }
            await dbClient.updateOne('appointments', { _id: apptId }, { $set: updateData });
        } else {
            const doctorAssigned = body.doctor_name || body.attending_doctor || req.user.full_name || 'Dr. Practitioner';
            const newRecord = {
                ...updateData,
                patient_name: body.patient_name,
                patient_phone: body.patient_phone || '',
                service_name: body.service_name || 'Dental Consultation',
                doctor_name: doctorAssigned,
                attending_doctor: doctorAssigned,
                appointment_date: body.appointment_date || body.date || new Date().toISOString().slice(0, 10),
                appointment_time: body.appointment_time || body.time_slot || '09:00 AM',
                created_at: updateData.completed_at
            };
            await dbClient.insertOne('appointments', newRecord);
        }

        await dbClient.insertOne('clinical_records', {
            appointment_id: apptId || '',
            patient_name: body.patient_name || '',
            doctor_name: body.doctor_name || req.user.full_name,
            diagnosis,
            treatment_category: body.treatment_category || body.category || 'General Dentistry',
            teeth_selected: teeth,
            prescription,
            created_at: new Date().toISOString().replace('T', ' ').slice(0, 19)
        });

        await logAudit(req, 'SAVE_CLINICAL_RECORD', 'ADMIN', { appointment_id: apptId, diagnosis }, 'success');

        return res.status(200).json({
            status: 'success',
            message: 'Clinical record saved successfully!'
        });
    } catch (err) {
        console.error('Admin save clinical record error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to save clinical record.' });
    }
});

export default router;


