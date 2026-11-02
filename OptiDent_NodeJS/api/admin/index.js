import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import dbClient from '../config/db.js';
import requireAuth from '../middleware/authGuard.js';
import logAudit from '../config/auditLogger.js';
import { sendStaffInvitationEmail } from '../config/mailer.js';

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
router.post('/update_user', async (req, res) => {
    try {
        const body = req.body;
        const userId = body.id || body.user_id || body._id;
        if (!userId) return res.status(400).json({ status: 'error', message: 'User ID is required.' });

        const updateData = {
            updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19)
        };
        if (body.full_name) updateData.full_name = body.full_name.trim();
        if (body.phone) updateData.phone = body.phone.trim();
        if (body.role) updateData.role = body.role.toLowerCase().trim();
        if (body.status) updateData.status = body.status.toLowerCase().trim();
        if (body.position) updateData.position = body.position.trim();
        if (body.specialization) updateData.specialization = body.specialization.trim();
        if (body.password) {
            updateData.password_hash = bcrypt.hashSync(body.password.trim(), 10);
        }

        await dbClient.updateOne('users', { _id: userId }, { $set: updateData });
        await logAudit(req, 'UPDATE_USER', 'ADMIN', { user_id: userId, update: updateData }, 'success');

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
        const userId = req.body.id || req.body.user_id || req.body._id;
        if (!userId) return res.status(400).json({ status: 'error', message: 'User ID is required.' });

        const user = await dbClient.findOne('users', { _id: userId });
        if (user && user.is_master) {
            return res.status(403).json({ status: 'error', message: 'Master Administrator account cannot be deleted.' });
        }

        await dbClient.updateOne('users', { _id: userId }, {
            $set: {
                is_deleted: true,
                status: 'deleted',
                deleted_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
                deleted_by: req.user.email
            }
        });

        await logAudit(req, 'DELETE_USER', 'ADMIN', { user_id: userId }, 'success');
        return res.status(200).json({ status: 'success', message: 'User moved to deleted records.' });
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
        const userId = req.body.id || req.body.user_id || req.body._id;
        if (!userId) return res.status(400).json({ status: 'error', message: 'User ID is required.' });

        const user = await dbClient.findOne('users', { _id: userId });
        if (!user) return res.status(404).json({ status: 'error', message: 'User not found.' });

        const newStatus = (user.status || 'active').toLowerCase() === 'active' ? 'inactive' : 'active';
        await dbClient.updateOne('users', { _id: userId }, {
            $set: { status: newStatus, updated_at: new Date().toISOString() }
        });

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
        const rolesList = [
            { id: "super_admin", name: "Super Admin", icon: "bx bx-shield-quarter", description: "Executive clinic administrator." },
            { id: "doctor", name: "Doctor (Dentist)", icon: "bx bxs-first-aid", description: "Licensed dental practitioner." },
            { id: "receptionist", name: "Receptionist (Staff)", icon: "bx bx-user", description: "Front-desk queue coordinator." },
            { id: "patient", name: "Client / Patient", icon: "bx bx-smile", description: "Registered dental patient." }
        ];

        let perms = await dbClient.find('roles_permissions', {});
        if (perms.length === 0) {
            // Seed default RBAC permissions if empty
            perms = [
                { module: "User Management", permission_key: "users_view", label: "View Users", roles: ["super_admin"] },
                { module: "User Management", permission_key: "users_create", label: "Create & Invite Users", roles: ["super_admin"] },
                { module: "User Management", permission_key: "users_edit", label: "Edit User Details & Roles", roles: ["super_admin"] },
                { module: "Appointments & Queue", permission_key: "appts_view_all", label: "View Clinic Calendar", roles: ["super_admin", "receptionist", "doctor"] },
                { module: "Appointments & Queue", permission_key: "appts_manage", label: "Manage Appointments & Queue", roles: ["super_admin", "receptionist"] },
                { module: "Clinical & Odontogram", permission_key: "clinical_write", label: "Chart Teeth & Prescribe Care", roles: ["super_admin", "doctor"] },
                { module: "Patient Self-Service", permission_key: "patient_portal", label: "Book & Reschedule Visits", roles: ["super_admin", "patient"] }
            ];
            for (const p of perms) {
                await dbClient.insertOne('roles_permissions', p);
            }
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
        const { permission_key, role, enabled } = req.body;
        if (!permission_key || !role) {
            return res.status(400).json({ status: 'error', message: 'Permission key and role are required.' });
        }

        const perm = await dbClient.findOne('roles_permissions', { permission_key });
        if (!perm) {
            return res.status(404).json({ status: 'error', message: 'Permission not found.' });
        }

        const rolesSet = new Set((perm.roles || []).map(r => r.toLowerCase()));
        if (enabled) {
            rolesSet.add(role.toLowerCase());
        } else {
            rolesSet.delete(role.toLowerCase());
        }

        await dbClient.updateOne('roles_permissions', { permission_key }, {
            $set: { roles: Array.from(rolesSet), updated_at: new Date().toISOString() }
        });

        return res.status(200).json({ status: 'success', message: 'Permission updated successfully.' });
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
        await dbClient.updateOne('system_settings', { setting_type: 'clinic_profile' }, {
            $set: {
                ...body,
                updated_at: new Date().toISOString()
            }
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

        // Synchronize process.env for recaptcha
        if (key === 'recaptcha_enabled') {
            process.env.ENABLE_RECAPTCHA = enabled ? 'true' : 'false';
        }

        await dbClient.updateOne('system_settings', { setting_type: 'clinic_profile' }, {
            $set: { integrations, updated_at: new Date().toISOString() }
        });

        await logAudit(req, 'TOGGLE_INTEGRATION', 'ADMIN', { key, enabled: !!enabled }, 'success');

        return res.status(200).json({ status: 'success', message: `Integration switch '${key}' set to ${enabled ? 'ENABLED' : 'DISABLED'}.`, integrations });
    } catch (err) {
        console.error('Toggle integration error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to toggle integration.' });
    }
});

/**
 * SA-006: Soft-Deleted Records
 */
router.get('/get_deleted_records', async (req, res) => {
    try {
        const users = await dbClient.find('users', { is_deleted: true });
        const appts = await dbClient.find('appointments', { is_deleted: true });

        const formattedUsers = users.map(u => ({
            id: String(u._id),
            type: 'user',
            title: `${u.full_name} (${u.role})`,
            deleted_at: u.deleted_at || u.updated_at || '',
            deleted_by: u.deleted_by || 'Admin'
        }));

        const formattedAppts = appts.map(a => ({
            id: String(a._id),
            type: 'appointment',
            title: `Appointment: ${a.patient_name} - ${a.service_name} (${a.date || a.appointment_date})`,
            deleted_at: a.deleted_at || a.updated_at || '',
            deleted_by: a.deleted_by || 'Admin'
        }));

        return res.status(200).json({
            status: 'success',
            records: [...formattedUsers, ...formattedAppts]
        });
    } catch (err) {
        console.error('Deleted records error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to retrieve deleted records.' });
    }
});

/**
 * Restore Record
 */
router.post('/restore_record', async (req, res) => {
    try {
        const { id, type } = req.body;
        if (!id) return res.status(400).json({ status: 'error', message: 'Record ID is required.' });

        const collection = type === 'appointment' ? 'appointments' : 'users';
        await dbClient.updateOne(collection, { _id: id }, {
            $set: { is_deleted: false, status: 'active', updated_at: new Date().toISOString() }
        });

        await logAudit(req, 'RESTORE_RECORD', 'ADMIN', { id, type }, 'success');
        return res.status(200).json({ status: 'success', message: 'Record restored successfully.' });
    } catch (err) {
        console.error('Restore error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to restore record.' });
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

        const todayStr = new Date().toISOString().slice(0, 10);
        let startDate = null;
        let endDate = null;

        if (datePreset === 'today') {
            startDate = todayStr;
            endDate = todayStr;
        } else if (datePreset === 'yesterday') {
            const d = new Date(); d.setDate(d.getDate() - 1);
            startDate = d.toISOString().slice(0, 10);
            endDate = startDate;
        } else if (datePreset === 'last_30_days') {
            const d = new Date(); d.setDate(d.getDate() - 30);
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
        const todayQueue = [];
        const cancellationsList = [];

        for (const apt of allAppts) {
            const aptDate = (apt.appointment_date || apt.date || apt.created_at || '').slice(0, 10);
            const status = (apt.status || 'scheduled').toLowerCase();
            const docName = apt.doctor_name || apt.attending_doctor || 'Doctor';

            if (startDate && endDate && (aptDate < startDate || aptDate > endDate)) continue;
            if (filterDoc !== 'all' && docName.toLowerCase() !== filterDoc.toLowerCase()) continue;
            if (filterStat !== 'all' && status !== filterStat) continue;

            const apptItem = {
                id: String(apt._id),
                patient_name: apt.patient_name || 'Patient',
                doctor_name: docName,
                service_name: apt.service_name || 'Consultation',
                appointment_date: aptDate,
                appointment_time: apt.appointment_time || apt.time_slot || '09:00 AM',
                operatory_chair: apt.operatory_chair || 'Chair 1',
                status: status,
                is_walkin: !!apt.is_walkin
            };

            filteredAppts.push(apptItem);

            if (status === 'completed') completedCount++;
            else if (['in_progress', 'in_chair'].includes(status)) inProgressCount++;
            else if (status === 'scheduled') scheduledCount++;
            else if (status === 'cancelled') {
                cancelledCount++;
                cancellationsList.push({
                    id: String(apt._id),
                    patient_name: apt.patient_name || 'Patient',
                    doctor_name: docName,
                    appointment_date: aptDate,
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
                security_events_count: securityCount
            },
            data: {
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
        const { user_id, role } = req.body;
        if (!user_id || !role) return res.status(400).json({ status: 'error', message: 'User ID and role are required.' });

        await dbClient.updateOne('users', { _id: user_id }, { $set: { role: role.toLowerCase(), updated_at: new Date().toISOString() } });
        return res.status(200).json({ status: 'success', message: 'Role assigned successfully.' });
    } catch (err) {
        return res.status(500).json({ status: 'error', message: 'Failed to assign role.' });
    }
});

/**
 * Purge Record (Permanent Delete)
 */
router.post('/purge_record', async (req, res) => {
    try {
        const { id, type } = req.body;
        if (!id) return res.status(400).json({ status: 'error', message: 'Record ID is required.' });

        const col = type === 'appointment' ? 'appointments' : 'users';
        await dbClient.deleteOne(col, { _id: id });
        return res.status(200).json({ status: 'success', message: 'Record permanently purged.' });
    } catch (err) {
        return res.status(500).json({ status: 'error', message: 'Failed to purge record.' });
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
        const user = configDoc?.smtp_user || process.env.SMTP_USER || 'jamgamer1014@gmail.com';
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

export default router;


