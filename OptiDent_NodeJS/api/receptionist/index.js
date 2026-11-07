import express from 'express';
import bcrypt from 'bcryptjs';
import dbClient from '../config/db.js';
import requireAuth from '../middleware/authGuard.js';
import logAudit from '../config/auditLogger.js';
import { getServicePrice, formatPhp } from '../config/servicePricing.js';
import { ClinicHoursHelper } from '../config/clinicHoursHelper.js';
import { sendAppointmentNotificationEmail } from '../config/mailer.js';

const router = express.Router();

router.use(requireAuth(['receptionist', 'staff', 'super_admin', 'admin', 'doctor']));

const DEFAULT_TIME_SLOTS = [
    '08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM',
    '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM'
];

/**
 * R-002: Receptionist Dashboard Data API
 */
router.get('/get_dashboard_data', async (req, res) => {
    try {
        const today = new Date().toISOString().slice(0, 10);
        const userDoc = await dbClient.findOne('users', { _id: req.user.id }) || await dbClient.findOne('users', { email: req.user.email });

        // Fetch all active users
        const allUsers = await dbClient.find('users', {});
        const patients = [];
        const doctors = [];

        for (const u of allUsers) {
            if (u.is_deleted || u.is_archived) continue;
            const uRole = (u.role || '').toLowerCase();
            if (uRole === 'patient' || uRole === 'client') {
                const emergName = u.emergency_contact_name || '';
                const emergPhone = u.emergency_contact_phone || '';
                const emergFull = emergName ? `${emergName} (${emergPhone})` : 'None recorded';

                patients.push({
                    _id: String(u._id),
                    full_name: u.full_name || 'Unknown Patient',
                    email: u.email || '',
                    phone: u.phone || 'N/A',
                    dob: u.dob || '',
                    gender: u.gender || '',
                    blood_type: u.blood_type || 'Unknown',
                    medical_alerts: u.allergies || u.medical_alerts || 'None recorded',
                    emergency_contact: emergFull,
                    emergency_contact_name: emergName,
                    emergency_contact_phone: emergPhone,
                    created_at: u.created_at || ''
                });
            } else if (uRole === 'doctor') {
                doctors.push({
                    _id: String(u._id),
                    full_name: u.full_name || 'Doctor',
                    email: u.email || '',
                    phone: u.phone || '',
                    specialization: u.specialization || 'General Dentistry',
                    schedule_days: u.working_days || 'Mon - Sat',
                    working_days: u.working_days || 'Mon - Sat',
                    opening_time: '08:00 AM',
                    closing_time: '05:00 PM',
                    time_slots: DEFAULT_TIME_SLOTS
                });
            }
        }

        // Fetch appointments
        const allAppointments = await dbClient.find('appointments', {});
        const queueToday = [];
        const upcomingAppointments = [];
        const allEnriched = [];

        let checkedInCount = 0;
        let inChairCount = 0;
        let completedToday = 0;

        for (const apt of allAppointments) {
            if (apt.is_deleted || apt.is_archived) continue;

            const aptDate = (apt.appointment_date || apt.date || '').slice(0, 10);
            const status = (apt.status || 'scheduled').toLowerCase();

            const item = {
                _id: String(apt._id),
                patient_id: apt.patient_id ? String(apt.patient_id) : '',
                patient_name: apt.patient_name || 'Unknown Patient',
                patient_phone: apt.patient_phone || '',
                patient_email: apt.patient_email || '',
                doctor_name: apt.doctor_name || apt.attending_doctor || 'Assigned Doctor',
                attending_doctor: apt.doctor_name || apt.attending_doctor || 'Assigned Doctor',
                service_name: apt.service_name || 'Dental Consultation',
                price: apt.price !== undefined && apt.price !== null && !isNaN(Number(apt.price)) ? Number(apt.price) : getServicePrice(apt.service_name),
                formatted_price: formatPhp(apt.price !== undefined && apt.price !== null && !isNaN(Number(apt.price)) ? Number(apt.price) : getServicePrice(apt.service_name)),
                appointment_date: aptDate,
                date: aptDate,
                time_slot: apt.time_slot || apt.appointment_time || '09:00 AM',
                appointment_time: apt.time_slot || apt.appointment_time || '09:00 AM',
                operatory_chair: apt.operatory_chair || 'Operatory Chair 1',
                status: status,
                queue_number: apt.queue_number || null,
                is_walkin: !!apt.is_walkin,
                notes: apt.notes || '',
                created_at: apt.created_at || ''
            };

            allEnriched.push(item);

            if (aptDate === today) {
                if (status === 'checked_in' || status === 'waiting') checkedInCount++;
                if (status === 'in_progress' || status === 'in_chair') inChairCount++;
                if (status === 'completed') completedToday++;
                queueToday.push(item);
            } else if (aptDate > today && status !== 'cancelled') {
                upcomingAppointments.push(item);
            }
        }

        // Assign queue position
        let rank = 1;
        queueToday.forEach(q => {
            if (['checked_in', 'waiting'].includes(q.status)) {
                q.queue_position = rank++;
            } else {
                q.queue_position = null;
            }
        });

        // Sort upcoming
        upcomingAppointments.sort((a, b) => (a.date + ' ' + a.time_slot).localeCompare(b.date + ' ' + b.time_slot));

        const services = await dbClient.find('services', {});
        const settings = await dbClient.findOne('system_settings', { setting_type: 'clinic_profile' }) || {};

        return res.status(200).json({
            status: 'success',
            receptionist: {
                id: String(userDoc?._id || req.user.id),
                full_name: userDoc?.full_name || req.user.full_name || 'Front Desk Staff',
                email: userDoc?.email || req.user.email,
                role: req.user.role,
                position: userDoc?.position || 'Front Desk Receptionist',
                phone: userDoc?.phone || '',
                avatar_color: userDoc?.avatar_color || '#0eb1b1'
            },
            metrics: {
                today_total: queueToday.length,
                checked_in: checkedInCount,
                in_progress: inChairCount,
                completed_today: completedToday,
                total_patients: patients.length,
                active_doctors: doctors.length
            },
            queue_today: queueToday,
            upcoming_appointments: upcomingAppointments.slice(0, 20),
            all_appointments: allEnriched,
            patients,
            doctors,
            services: services.length > 0 ? services : [
                { name: "Dental Consultation & Oral Examination", price: "₱500.00" },
                { name: "Oral Prophylaxis (Dental Cleaning)", price: "₱1,200.00" },
                { name: "Tooth Restoration / Light-Cure Composite Filling", price: "₱1,500.00" }
            ],
            clinic_settings: {
                operating_hours: settings.operating_hours || 'Mon - Sat: 08:00 AM - 05:00 PM',
                time_slots: DEFAULT_TIME_SLOTS
            }
        });
    } catch (err) {
        console.error('Receptionist dashboard error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to load receptionist dashboard.' });
    }
});

/**
 * R-003: Create Appointment (Walk-in or Scheduled)
 */
router.post('/create_appointment', async (req, res) => {
    try {
        const body = req.body;
        const patientName = (body.patient_name || '').trim();
        const date = (body.appointment_date || body.date || '').trim();
        const timeSlot = (body.time_slot || body.time || '').trim();

        if (!patientName || !date || !timeSlot) {
            return res.status(400).json({ status: 'error', message: 'Patient name, date, and time slot are required.' });
        }

        const isWalkin = !!body.is_walkin;
        let queueNumber = null;
        if (isWalkin) {
            const today = date;
            const count = await dbClient.countDocuments('appointments', { appointment_date: today, is_walkin: true });
            queueNumber = count + 1;
        }

        const newAppt = {
            patient_id: body.patient_id ? String(body.patient_id) : '',
            patient_name: patientName,
            patient_phone: body.patient_phone || '',
            patient_email: body.patient_email || '',
            appointment_date: date,
            date: date,
            time_slot: timeSlot,
            appointment_time: timeSlot,
            doctor_name: body.doctor_name || 'First Available Doctor',
            attending_doctor: body.doctor_name || 'First Available Doctor',
            service_name: body.service_name || 'Dental Consultation',
            price: getServicePrice(body.service_name, body.price),
            formatted_price: formatPhp(getServicePrice(body.service_name, body.price)),
            operatory_chair: body.operatory_chair || 'Operatory Chair 1',
            status: isWalkin ? 'checked_in' : (body.status || 'scheduled'),
            queue_number: queueNumber,
            is_walkin: isWalkin,
            notes: body.notes || '',
            is_deleted: false,
            is_archived: false,
            created_by: req.user.email,
            created_at: new Date().toISOString().replace('T', ' ').slice(0, 19)
        };

        const result = await dbClient.insertOne('appointments', newAppt);
        await logAudit(req, 'CREATE_APPOINTMENT', 'RECEPTIONIST', { appointment_id: result.insertedId, patientName, date, timeSlot }, 'success');

        const targetPatientEmail = body.patient_email || (body.patient_id ? (await dbClient.findOne('users', { _id: body.patient_id }))?.email : '') || 'edjamenf@gmail.com';
        sendAppointmentNotificationEmail(targetPatientEmail, patientName, {
            id: String(result.insertedId || newAppt._id || ''),
            date,
            time: timeSlot,
            doctor_name: newAppt.doctor_name,
            service_name: newAppt.service_name
        }, 'booked').catch(e => console.warn('[Email Warning] Receptionist create notify error:', e.message));

        return res.status(201).json({
            status: 'success',
            message: 'Appointment scheduled successfully!',
            appointment_id: result.insertedId
        });
    } catch (err) {
        console.error('Create appointment error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to create appointment.' });
    }
});

/**
 * Delete Appointment(s) (Supports multiple selection!)
 */
router.post('/delete_appointment', async (req, res) => {
    try {
        const body = req.body;
        let ids = [];
        if (Array.isArray(body.appointment_ids)) {
            ids = body.appointment_ids;
        } else if (body.appointment_id) {
            ids = [body.appointment_id];
        }

        if (ids.length === 0) {
            return res.status(400).json({ status: 'error', message: 'At least one appointment ID is required.' });
        }

        let deletedCount = 0;
        for (const id of ids) {
            await dbClient.updateOne('appointments', { _id: id }, {
                $set: {
                    is_deleted: true,
                    status: 'cancelled',
                    deleted_by: req.user.email,
                    deleted_at: new Date().toISOString().replace('T', ' ').slice(0, 19)
                }
            });
            deletedCount++;
        }

        await logAudit(req, 'DELETE_APPOINTMENT', 'RECEPTIONIST', { appointment_ids: ids, count: deletedCount }, 'success');

        return res.status(200).json({
            status: 'success',
            message: `Successfully deleted ${deletedCount} appointment(s).`,
            deleted_count: deletedCount
        });
    } catch (err) {
        console.error('Delete appointment error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to delete appointment(s).' });
    }
});

/**
 * Reschedule Appointment
 */
router.post('/reschedule_appointment', async (req, res) => {
    try {
        const body = req.body;
        const apptId = body.appointment_id;
        const newDate = body.appointment_date || body.date;
        const newTime = body.time_slot || body.time;

        if (!apptId || !newDate || !newTime) {
            return res.status(400).json({ status: 'error', message: 'Appointment ID, new date, and time slot are required.' });
        }

        const appt = await dbClient.findOne('appointments', { _id: apptId });
        if (!appt) return res.status(404).json({ status: 'error', message: 'Appointment record not found.' });

        const updateData = {
            appointment_date: newDate,
            date: newDate,
            time_slot: newTime,
            appointment_time: newTime,
            status: 'scheduled',
            reschedule_reason: body.reason || 'Rescheduled by Receptionist',
            updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19)
        };
        if (body.doctor_name) {
            updateData.doctor_name = body.doctor_name;
            updateData.attending_doctor = body.doctor_name;
        }

        await dbClient.updateOne('appointments', { _id: apptId }, { $set: updateData });
        await logAudit(req, 'RESCHEDULE_APPOINTMENT', 'RECEPTIONIST', { appointment_id: apptId, newDate, newTime }, 'success');

        const patientEmail = appt.patient_email || 'edjamenf@gmail.com';
        sendAppointmentNotificationEmail(patientEmail, appt.patient_name, {
            id: String(appt._id),
            date: newDate,
            time: newTime,
            doctor_name: updateData.doctor_name || appt.doctor_name,
            service_name: appt.service_name
        }, 'rescheduled').catch(e => console.warn('[Email Warning] Receptionist reschedule notify error:', e.message));

        return res.status(200).json({
            status: 'success',
            message: 'Appointment successfully rescheduled.'
        });
    } catch (err) {
        console.error('Reschedule error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to reschedule appointment.' });
    }
});

/**
 * Cancel Appointment
 */
router.post('/cancel_appointment', async (req, res) => {
    try {
        const body = req.body;
        const apptId = body.appointment_id;
        if (!apptId) return res.status(400).json({ status: 'error', message: 'Appointment ID is required.' });

        const appt = await dbClient.findOne('appointments', { _id: apptId });
        await dbClient.updateOne('appointments', { _id: apptId }, {
            $set: {
                status: 'cancelled',
                cancellation_reason: body.reason || 'Cancelled by Front Desk',
                cancelled_at: new Date().toISOString().replace('T', ' ').slice(0, 19)
            }
        });

        if (appt && appt.patient_email) {
            sendAppointmentNotificationEmail(appt.patient_email, appt.patient_name, {
                id: String(appt._id),
                date: appt.date || appt.appointment_date,
                time: appt.time || appt.time_slot,
                doctor_name: appt.doctor_name,
                service_name: appt.service_name
            }, 'cancelled').catch(e => console.warn('[Email Warning] Front desk cancel notify error:', e.message));
        }

        await logAudit(req, 'CANCEL_APPOINTMENT', 'RECEPTIONIST', { appointment_id: apptId }, 'success');
        return res.status(200).json({ status: 'success', message: 'Appointment cancelled.' });
    } catch (err) {
        console.error('Cancel appointment error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to cancel appointment.' });
    }
});

/**
 * Update Appointment Status (checked_in, in_progress, completed, cancelled)
 */
router.post('/update_appointment_status', async (req, res) => {
    try {
        const body = req.body;
        const apptId = body.appointment_id;
        const newStatus = (body.status || '').toLowerCase();

        if (!apptId || !newStatus) {
            return res.status(400).json({ status: 'error', message: 'Appointment ID and new status are required.' });
        }

        const updateDoc = {
            status: newStatus,
            updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19)
        };
        if (newStatus === 'checked_in') updateDoc.checked_in_at = updateDoc.updated_at;
        if (newStatus === 'completed') updateDoc.completed_at = updateDoc.updated_at;

        await dbClient.updateOne('appointments', { _id: apptId }, { $set: updateDoc });
        await logAudit(req, 'UPDATE_STATUS', 'RECEPTIONIST', { appointment_id: apptId, status: newStatus }, 'success');

        return res.status(200).json({ status: 'success', message: `Status updated to ${newStatus}.` });
    } catch (err) {
        console.error('Status update error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to update status.' });
    }
});

/**
 * Register Walk-In Patient
 */
router.post('/register_patient', async (req, res) => {
    try {
        const body = req.body;
        const fullName = (body.full_name || '').trim();
        const phone = (body.phone || '').trim();
        const email = (body.email || '').trim().toLowerCase();

        if (!fullName || !phone) {
            return res.status(400).json({ status: 'error', message: 'Patient full name and phone number are required.' });
        }

        const newPatient = {
            full_name: fullName,
            phone: phone,
            email: email,
            dob: body.dob || '',
            gender: body.gender || 'Not Specified',
            blood_type: body.blood_type || 'Unknown',
            address: body.address || '',
            allergies: body.allergies || body.medical_alerts || 'None recorded',
            emergency_contact_name: body.emergency_contact_name || '',
            emergency_contact_phone: body.emergency_contact_phone || '',
            role: 'patient',
            status: 'active',
            reward_points: 0,
            created_at: new Date().toISOString().replace('T', ' ').slice(0, 19)
        };

        const result = await dbClient.insertOne('users', newPatient);
        await dbClient.insertOne('patients', { ...newPatient, user_id: result.insertedId });
        await logAudit(req, 'REGISTER_PATIENT', 'RECEPTIONIST', { patient_id: result.insertedId, fullName }, 'success');

        return res.status(201).json({
            status: 'success',
            message: 'Patient registered successfully!',
            patient_id: result.insertedId
        });
    } catch (err) {
        console.error('Register patient error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to register patient.' });
    }
});

/**
 * R-012: Receptionist Profile Management
 */
router.post('/update_profile', async (req, res) => {
    try {
        const body = req.body;
        const fullName = (body.full_name || '').trim();
        const email = (body.email || '').trim().toLowerCase();
        const phone = (body.phone || '').trim();
        const bio = (body.bio || '').trim();
        const avatarColor = body.avatar_color || '#0eb1b1';

        if (!fullName || !email) {
            return res.status(400).json({ status: 'error', message: 'Full name and email are required.' });
        }

        await dbClient.updateOne('users', { _id: req.user.id }, {
            $set: {
                full_name: fullName,
                email: email,
                phone: phone,
                bio: bio,
                avatar_color: avatarColor,
                updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19)
            }
        });

        req.session.email = email;
        req.session.full_name = fullName;

        await logAudit(req, 'UPDATE_PROFILE', 'RECEPTIONIST', { full_name: fullName, email }, 'success');

        return res.status(200).json({
            status: 'success',
            message: 'Receptionist profile updated successfully!'
        });
    } catch (err) {
        console.error('Update profile error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to update profile.' });
    }
});

/**
 * Change Password
 */
router.post('/change_password', async (req, res) => {
    try {
        const body = req.body;
        const curPass = body.current_password || '';
        const newPass = body.new_password || '';

        if (!curPass || !newPass) {
            return res.status(400).json({ status: 'error', message: 'Both current and new passwords are required.' });
        }

        if (newPass.length < 8) {
            return res.status(400).json({ status: 'error', message: 'New password must be at least 8 characters long.' });
        }

        const user = await dbClient.findOne('users', { _id: req.user.id });
        if (!user) return res.status(404).json({ status: 'error', message: 'Account not found.' });

        let matches = false;
        if (user.password_hash) {
            const normalized = user.password_hash.replace(/^\$2y\$/, '$2a$');
            matches = bcrypt.compareSync(curPass, normalized);
        } else if (user.password) {
            matches = (user.password === curPass);
        }

        if (!matches) {
            return res.status(401).json({ status: 'error', message: 'Incorrect current password.' });
        }

        const newHash = bcrypt.hashSync(newPass, 10);
        await dbClient.updateOne('users', { _id: req.user.id }, {
            $set: { password_hash: newHash, updated_at: new Date().toISOString() }
        });

        return res.status(200).json({ status: 'success', message: 'Password changed successfully.' });
    } catch (err) {
        console.error('Change password error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to change password.' });
    }
});

/**
 * R-004: Patient Search Live API
 */
router.get('/search_patients', async (req, res) => {
    try {
        const query = (req.query.q || req.query.query || req.query.search || '').trim().toLowerCase();
        const filter = (req.query.filter || 'all').toLowerCase();
        const todayDate = new Date().toISOString().slice(0, 10);

        const allUsers = await dbClient.find('users', {});
        const allAppts = await dbClient.find('appointments', {});

        const apptsByPatientName = new Map();
        const apptsByPatientPhone = new Map();
        const apptsByPatientEmail = new Map();

        for (const apt of allAppts) {
            if (apt.is_deleted || apt.is_archived) continue;
            const pName = (apt.patient_name || '').toLowerCase().trim();
            const pPhone = (apt.patient_phone || '').trim();
            const pEmail = (apt.patient_email || '').toLowerCase().trim();

            if (pName) {
                if (!apptsByPatientName.has(pName)) apptsByPatientName.set(pName, []);
                apptsByPatientName.get(pName).push(apt);
            }
            if (pPhone) {
                if (!apptsByPatientPhone.has(pPhone)) apptsByPatientPhone.set(pPhone, []);
                apptsByPatientPhone.get(pPhone).push(apt);
            }
            if (pEmail) {
                if (!apptsByPatientEmail.has(pEmail)) apptsByPatientEmail.set(pEmail, []);
                apptsByPatientEmail.get(pEmail).push(apt);
            }
        }

        const results = [];
        let countAll = 0;
        let countAlerts = 0;
        let countReturning = 0;
        let countWalkin = 0;

        for (const u of allUsers) {
            if (u.is_deleted || u.is_archived) continue;
            const uRole = (u.role || '').toLowerCase();
            if (uRole !== 'patient' && uRole !== 'client') continue;

            countAll++;

            const name = u.full_name || '';
            const phone = u.phone || '';
            const email = u.email || '';
            const address = u.address || '';
            const alerts = u.allergies || u.medical_alerts || 'None recorded';
            const isWalkin = !!u.is_walkin;
            const hasAlert = alerts && !['none', 'none recorded', 'nkda'].includes(alerts.toLowerCase().trim());
            if (hasAlert) countAlerts++;
            if (isWalkin) countWalkin++;

            const patientAppts = apptsByPatientEmail.get(email.toLowerCase()) ||
                                 apptsByPatientPhone.get(phone) ||
                                 apptsByPatientName.get(name.toLowerCase()) || [];

            const totalVisits = patientAppts.filter(a => (a.status || '').toLowerCase() === 'completed').length;
            if (totalVisits >= 1) countReturning++;

            // Check search query
            if (query) {
                const matches = name.toLowerCase().includes(query) ||
                                phone.toLowerCase().includes(query) ||
                                email.toLowerCase().includes(query) ||
                                address.toLowerCase().includes(query) ||
                                alerts.toLowerCase().includes(query);
                if (!matches) continue;
            }

            // Check filter
            if (filter === 'alerts' && !hasAlert) continue;
            if (filter === 'returning' && totalVisits < 1) continue;
            if (filter === 'walkin' && !isWalkin) continue;

            // Find last visit
            let lastVisitDate = null;
            let lastService = null;
            let todayAppt = null;

            for (const a of patientAppts) {
                const aDate = (a.appointment_date || a.date || '').slice(0, 10);
                if (aDate === todayDate && !['cancelled', 'completed'].includes((a.status || '').toLowerCase())) {
                    todayAppt = {
                        appointment_id: String(a._id),
                        status: a.status || 'scheduled',
                        time_slot: a.time_slot || a.appointment_time || '',
                        doctor_name: a.doctor_name || a.attending_doctor || '',
                        service_name: a.service_name || '',
                        operatory_chair: a.operatory_chair || '',
                        queue_number: a.queue_number || null,
                        is_walkin: !!a.is_walkin
                    };
                }
                if ((a.status || '').toLowerCase() === 'completed') {
                    if (!lastVisitDate || aDate > lastVisitDate) {
                        lastVisitDate = aDate;
                        lastService = a.service_name || '';
                    }
                }
            }

            results.push({
                _id: String(u._id),
                full_name: name,
                phone: phone,
                email: email,
                dob: u.dob || '',
                gender: u.gender || 'Not Specified',
                blood_type: u.blood_type || 'Unknown',
                address: address,
                medical_alerts: alerts,
                has_alert: hasAlert,
                emergency_contact: u.emergency_contact_name ? `${u.emergency_contact_name} (${u.emergency_contact_phone || ''})` : 'N/A',
                emergency_contact_name: u.emergency_contact_name || '',
                emergency_contact_phone: u.emergency_contact_phone || '',
                is_walkin: isWalkin,
                total_visits: totalVisits,
                is_returning: totalVisits >= 1,
                last_visit_date: lastVisitDate,
                last_service: lastService,
                today_appointment: todayAppt,
                created_at: u.created_at || ''
            });
        }

        results.sort((a, b) => b.total_visits - a.total_visits || a.full_name.localeCompare(b.full_name));

        return res.status(200).json({
            status: 'success',
            total: results.length,
            query: req.query.q || '',
            filter: filter,
            counts: {
                all: countAll,
                alerts: countAlerts,
                returning: countReturning,
                walkin: countWalkin
            },
            patients: results
        });
    } catch (err) {
        console.error('Search patients error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to search patients.' });
    }
});

/**
 * R-008: Schedule Monitoring Matrix API
 */
router.get('/get_doctor_schedule_slots', async (req, res) => {
    try {
        const targetDate = req.query.date || new Date().toISOString().slice(0, 10);
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const fullDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dObj = new Date(targetDate + 'T00:00:00');
        const dayAbbr = dayNames[dObj.getDay()];
        const dayFullName = fullDayNames[dObj.getDay()];

        const allUsers = await dbClient.find('users', { role: 'doctor' });
        const allAppts = await dbClient.find('appointments', {});

        const dateAppts = allAppts.filter(a => {
            if (a.is_deleted || a.is_archived) return false;
            const aDate = (a.appointment_date || a.date || '').slice(0, 10);
            return aDate === targetDate && ['scheduled', 'checked_in', 'waiting', 'in_progress', 'completed'].includes((a.status || '').toLowerCase());
        });

        const doctorSchedules = [];
        let totalCapacity = 0;
        let totalBooked = 0;
        let totalAvailable = 0;
        let onDutyCount = 0;

        for (const doc of allUsers) {
            if (doc.is_deleted || doc.is_archived) continue;
            const docName = doc.full_name || 'Doctor';
            const workingDays = doc.working_days || 'Monday - Saturday';
            const offDates = Array.isArray(doc.off_duty_dates) ? doc.off_duty_dates : [];
            const isSpecificOff = offDates.includes(targetDate);
            const extraDates = Array.isArray(doc.extra_duty_dates) ? doc.extra_duty_dates : [];
            const isSpecificExtra = extraDates.includes(targetDate);
            const customHours = doc.custom_date_hours && doc.custom_date_hours[targetDate];

            const isStandardDutyDay = !workingDays.toLowerCase().includes('closed') && (dayAbbr !== 'Sun' || workingDays.toLowerCase().includes('sun'));
            const isOnDuty = (!isSpecificOff && isStandardDutyDay) || isSpecificExtra;

            if (isOnDuty) onDutyCount++;

            // Calculate active hours for this date
            let allowedSlotsForDoc = DEFAULT_TIME_SLOTS;
            if (customHours && customHours.start && customHours.end) {
                allowedSlotsForDoc = ClinicHoursHelper.generateSlots(customHours.start, customHours.end, false);
            }

            const slotsData = [];
            let docBooked = 0;
            let docAvailable = 0;

            for (const slot of DEFAULT_TIME_SLOTS) {
                if (!isOnDuty) {
                    slotsData.push({
                        time: slot,
                        status: 'off_duty',
                        status_label: 'Off Duty (Leave)',
                        appointment: null
                    });
                    continue;
                }

                // If doctor has custom/half-day shift and slot is outside shift hours
                if (customHours && !allowedSlotsForDoc.includes(slot)) {
                    slotsData.push({
                        time: slot,
                        status: 'off_duty',
                        status_label: `Off Duty (${customHours.label || 'Shift'})`,
                        appointment: null
                    });
                    continue;
                }

                const bookedApt = dateAppts.find(a => {
                    const matchDoc = !a.doctor_name || a.doctor_name === docName || a.doctor_name === 'First Available Doctor';
                    const matchTime = (a.time_slot || a.appointment_time) === slot;
                    return matchDoc && matchTime;
                });

                if (bookedApt) {
                    docBooked++;
                    totalBooked++;
                    slotsData.push({
                        time: slot,
                        status: 'occupied',
                        status_label: bookedApt.status || 'Booked',
                        appointment: {
                            id: String(bookedApt._id),
                            patient_name: bookedApt.patient_name || 'Patient',
                            service: bookedApt.service_name || 'Consultation',
                            chair: bookedApt.operatory_chair || 'Chair 1'
                        }
                    });
                } else {
                    docAvailable++;
                    totalAvailable++;
                    slotsData.push({
                        time: slot,
                        status: 'available',
                        status_label: 'Available',
                        appointment: null
                    });
                }
                if (isOnDuty) totalCapacity++;
            }

            doctorSchedules.push({
                doctor_id: String(doc._id),
                full_name: docName,
                specialization: doc.specialization || 'General Dentistry',
                phone: doc.phone || '',
                working_days: workingDays,
                schedule_days: doc.schedule_days || workingDays,
                opening_time: '08:00 AM',
                closing_time: '05:00 PM',
                lunch_break: true,
                is_on_duty_today: isOnDuty,
                total_slots: DEFAULT_TIME_SLOTS.length,
                booked_count: docBooked,
                available_count: docAvailable,
                slots: slotsData
            });
        }

        const utilRate = totalCapacity > 0 ? Math.round((totalBooked / totalCapacity) * 100) : 0;

        return res.status(200).json({
            status: 'success',
            selected_date: targetDate,
            day_name: dayFullName,
            day_abbr: dayAbbr,
            summary: {
                total_doctors: allUsers.length,
                doctors_on_duty: onDutyCount,
                total_capacity_slots: totalCapacity,
                booked_slots: totalBooked,
                available_slots: totalAvailable,
                utilization_rate: utilRate
            },
            doctor_schedules: doctorSchedules,
            master_slots: DEFAULT_TIME_SLOTS
        });
    } catch (err) {
        console.error('Doctor schedule slots error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to retrieve schedule slots.' });
    }
});

/**
 * R-004: Patient Details & History
 */
router.get('/get_patient_details', async (req, res) => {
    try {
        const pId = req.query.id || req.query.patient_id;
        const pPhone = req.query.phone;
        const pEmail = req.query.email;
        const pName = req.query.name || req.query.full_name;

        let patient = null;
        if (pId) {
            patient = await dbClient.findOne('users', { _id: pId });
        } else if (pPhone) {
            patient = await dbClient.findOne('users', { phone: pPhone, role: 'patient' });
        } else if (pEmail) {
            patient = await dbClient.findOne('users', { email: pEmail.toLowerCase(), role: 'patient' });
        } else if (pName) {
            patient = await dbClient.findOne('users', { full_name: pName, role: 'patient' });
        }

        if (!patient) return res.status(404).json({ status: 'error', message: 'Patient record not found.' });

        const allAppts = await dbClient.find('appointments', {});
        const pAppts = allAppts.filter(a => {
            if (a.is_deleted || a.is_archived) return false;
            return (a.patient_id && String(a.patient_id) === String(patient._id)) ||
                   (a.patient_email && a.patient_email.toLowerCase() === patient.email.toLowerCase()) ||
                   (a.patient_phone && a.patient_phone === patient.phone) ||
                   (a.patient_name && a.patient_name.toLowerCase() === patient.full_name.toLowerCase());
        });

        pAppts.sort((a, b) => (b.appointment_date || b.date || '').localeCompare(a.appointment_date || a.date || ''));

        return res.status(200).json({
            status: 'success',
            patient: {
                _id: String(patient._id),
                id: String(patient._id),
                full_name: patient.full_name,
                email: patient.email,
                phone: patient.phone,
                dob: patient.dob || '',
                gender: patient.gender || 'Not Specified',
                blood_type: patient.blood_type || 'Unknown',
                address: patient.address || '',
                medical_alerts: patient.allergies || patient.medical_alerts || 'None recorded',
                emergency_contact_name: patient.emergency_contact_name || '',
                emergency_contact_phone: patient.emergency_contact_phone || '',
                emergency_contact: patient.emergency_contact_name ? `${patient.emergency_contact_name} (${patient.emergency_contact_phone || ''})` : 'N/A',
                created_at: patient.created_at || ''
            },
            appointments: pAppts,
            total_visits: pAppts.filter(a => (a.status || '').toLowerCase() === 'completed').length
        });
    } catch (err) {
        console.error('Patient details error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to retrieve patient details.' });
    }
});

/**
 * R-004: Fast Check-in for Returning Patients
 */
router.post('/checkin_returning_patient', async (req, res) => {
    try {
        const body = req.body;
        const patientId = body.patient_id;
        const phone = body.patient_phone || body.phone;
        const doctorName = body.doctor_name || 'First Available Doctor';
        const serviceName = body.service_name || 'Dental Consultation';
        const operatoryChair = body.operatory_chair || 'Operatory Chair 1';
        const notes = body.chief_complaint || body.notes || 'Returning patient arrival check-in';

        let patient = null;
        if (patientId) patient = await dbClient.findOne('users', { _id: patientId });
        if (!patient && phone) patient = await dbClient.findOne('users', { phone, role: 'patient' });

        if (!patient) return res.status(404).json({ status: 'error', message: 'Patient not found in system.' });

        const today = new Date().toISOString().slice(0, 10);
        const count = await dbClient.countDocuments('appointments', { appointment_date: today });
        const queueNumber = count + 1;

        const newAppt = {
            patient_id: String(patient._id),
            patient_name: patient.full_name,
            patient_phone: patient.phone,
            patient_email: patient.email,
            appointment_date: today,
            date: today,
            time_slot: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            appointment_time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            doctor_name: doctorName,
            attending_doctor: doctorName,
            service_name: serviceName,
            operatory_chair: operatoryChair,
            status: 'checked_in',
            checked_in_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
            queue_number: queueNumber,
            is_walkin: true,
            notes: notes,
            created_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
            created_by: req.user.email
        };

        const result = await dbClient.insertOne('appointments', newAppt);
        await logAudit(req, 'CHECKIN_RETURNING', 'RECEPTIONIST', { appointment_id: result.insertedId, patient: patient.full_name }, 'success');

        return res.status(201).json({
            status: 'success',
            message: `${patient.full_name} checked in successfully! Assigned Queue #${queueNumber}.`,
            appointment_id: result.insertedId,
            queue_number: queueNumber
        });
    } catch (err) {
        console.error('Checkin returning error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to check in returning patient.' });
    }
});

/**
 * Update Patient Demographics & Alerts
 */
router.post('/update_patient', async (req, res) => {
    try {
        const body = req.body;
        const patientId = body.patient_id || body.id;
        if (!patientId) return res.status(400).json({ status: 'error', message: 'Patient ID is required.' });

        const updateData = {
            updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19)
        };
        if (body.phone) updateData.phone = body.phone.trim();
        if (body.email) updateData.email = body.email.trim().toLowerCase();
        if (body.address) updateData.address = body.address.trim();
        if (body.dob) updateData.dob = body.dob.trim();
        if (body.gender) updateData.gender = body.gender.trim();
        if (body.blood_type) updateData.blood_type = body.blood_type.trim();
        if (body.allergies || body.medical_alerts) {
            const alerts = body.allergies || body.medical_alerts;
            updateData.allergies = alerts;
            updateData.medical_alerts = alerts;
        }
        if (body.emergency_contact_name) updateData.emergency_contact_name = body.emergency_contact_name.trim();
        if (body.emergency_contact_phone) updateData.emergency_contact_phone = body.emergency_contact_phone.trim();

        await dbClient.updateOne('users', { _id: patientId }, { $set: updateData });
        return res.status(200).json({ status: 'success', message: 'Patient profile updated.' });
    } catch (err) {
        console.error('Update patient error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to update patient.' });
    }
});

/**
 * Update Appointment Details (procedure, doctor, chair, notes)
 */
router.post('/update_appointment', async (req, res) => {
    try {
        const body = req.body;
        const apptId = body.appointment_id || body.id;
        if (!apptId) return res.status(400).json({ status: 'error', message: 'Appointment ID is required.' });

        const appt = await dbClient.findOne('appointments', { _id: apptId });
        if (!appt) {
            return res.status(404).json({ status: 'error', message: 'Appointment record not found.' });
        }

        const updateData = {
            updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
            updated_by: req.user.email
        };

        if (body.doctor_name) {
            updateData.doctor_name = body.doctor_name.trim();
            updateData.attending_doctor = body.doctor_name.trim();
        }
        if (body.service_name) updateData.service_name = body.service_name.trim();
        if (body.operatory_chair) updateData.operatory_chair = body.operatory_chair.trim();
        if (body.appointment_date || body.date) {
            const newDate = (body.appointment_date || body.date).trim();
            updateData.appointment_date = newDate;
            updateData.date = newDate;
        }
        if (body.time_slot || body.appointment_time) {
            const time = (body.time_slot || body.appointment_time).trim();
            updateData.time_slot = time;
            updateData.appointment_time = time;
        }
        if (body.status) {
            const newStatus = body.status.toLowerCase().trim();
            updateData.status = newStatus;
            if (newStatus === 'checked_in') updateData.checked_in_at = updateData.updated_at;
            if (newStatus === 'completed') updateData.completed_at = updateData.updated_at;
            if (newStatus === 'cancelled' && body.cancellation_reason) {
                updateData.cancellation_reason = body.cancellation_reason.trim();
            }
        }
        if (body.price !== undefined && body.price !== null && !isNaN(Number(body.price))) {
            updateData.price = Number(body.price);
        }
        if (body.patient_phone) {
            updateData.patient_phone = body.patient_phone.trim();
        }
        if (body.notes !== undefined) {
            updateData.notes = (body.notes || '').trim();
        }

        await dbClient.updateOne('appointments', { _id: apptId }, { $set: updateData });
        await logAudit(req, 'UPDATE_APPOINTMENT_DETAILS', 'RECEPTIONIST', { appointment_id: apptId, ...updateData }, 'success');

        return res.status(200).json({ status: 'success', message: 'Appointment details updated successfully.' });
    } catch (err) {
        console.error('Update appointment error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to update appointment.' });
    }
});

/**
 * Reorder Queue Priority
 */
router.post('/reorder_queue', async (req, res) => {
    try {
        const { appointment_id, operatory_chair, priority } = req.body;
        if (!appointment_id) return res.status(400).json({ status: 'error', message: 'Appointment ID is required.' });

        const updateData = { updated_at: new Date().toISOString() };
        if (operatory_chair) updateData.operatory_chair = operatory_chair;
        if (priority) updateData.priority = priority;

        await dbClient.updateOne('appointments', { _id: appointment_id }, { $set: updateData });
        return res.status(200).json({ status: 'success', message: 'Queue updated.' });
    } catch (err) {
        return res.status(500).json({ status: 'error', message: 'Failed to reorder queue.' });
    }
});

/**
 * Role-Governed Front Desk & Operational Reports
 * Permissions dynamically enforced via MongoDB `roles_permissions` collection configured by Super Admin.
 */
router.get('/get_reports_data', async (req, res) => {
    try {
        const category = (req.query.category || 'queue_summary').toLowerCase();
        const datePreset = (req.query.date_preset || 'today').toLowerCase();
        const customFrom = req.query.date_from || '';
        const customTo = req.query.date_to || '';
        const filterDoc = req.query.doctor || 'all';
        const filterStat = (req.query.status || 'all').toLowerCase();

        // Map report categories to RBAC Matrix permission keys
        const categoryConfigMap = {
            'earnings': { key: 'reports_earnings', title: 'Financial Earnings & Revenue' },
            'daily_collections': { key: 'reports_earnings', title: 'Financial Earnings & Revenue' },
            'service_inflow': { key: 'reports_earnings', title: 'Financial Earnings & Revenue' },
            'appointments': { key: 'reports_appointments', title: 'Appointments & Procedures' },
            'appointments_roster': { key: 'reports_appointments', title: 'Appointments & Procedures' },
            'patients': { key: 'reports_patients', title: 'Patient Registry & Demographics' },
            'patient_attendance': { key: 'reports_patients', title: 'Patient Registry & Demographics' },
            'queues': { key: 'reports_queues', title: 'Live Patient Flow Queue' },
            'queue_summary': { key: 'reports_queues', title: 'Live Patient Flow Queue' },
            'cancellations': { key: 'reports_cancellations', title: 'Cancellations & Attrition' },
            'audit_logs': { key: 'reports_audit_logs', title: 'System Security & Audit Trail' }
        };

        const config = categoryConfigMap[category] || { key: `reports_${category}`, title: category.toUpperCase() };

        // Dynamic RBAC Permission Check against MongoDB roles_permissions
        const userRole = (req.user?.role || req.session?.role || 'receptionist').toLowerCase();
        let isPermitted = ['super_admin', 'admin'].includes(userRole);

        if (!isPermitted) {
            const permDoc = await dbClient.findOne('roles_permissions', {
                $or: [{ key: config.key }, { permission_key: config.key }]
            });

            if (permDoc && Array.isArray(permDoc.roles)) {
                const authorizedRoles = permDoc.roles.map(r => String(r).toLowerCase());
                if (authorizedRoles.includes(userRole) || (userRole === 'staff' && authorizedRoles.includes('receptionist'))) {
                    isPermitted = true;
                }
            } else {
                // Fallback standard defaults if RBAC matrix has not been seeded yet
                const defaultRoleRules = {
                    'reports_appointments': ['receptionist', 'doctor', 'staff'],
                    'reports_patients': ['receptionist', 'staff'],
                    'reports_queues': ['receptionist', 'doctor', 'staff'],
                    'reports_cancellations': ['receptionist', 'staff']
                };
                if (defaultRoleRules[config.key]?.includes(userRole)) {
                    isPermitted = true;
                }
            }
        }

        if (!isPermitted) {
            return res.status(403).json({
                status: 'error',
                message: `Access Denied: Your assigned role (${userRole}) has not been granted permission by Super Admin to generate the "${config.title}" report. Please ask a Super Admin to enable this in the Role Permissions (RBAC Matrix).`
            });
        }

        const now = new Date();
        const manilaOffset = 8 * 60; // UTC+8
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
        const rawAuditLogs = (config.key === 'reports_audit_logs') ? await dbClient.find('audit_logs', {}) : [];

        const doctorsList = [];
        const patientsList = [];

        for (const u of allUsers) {
            const role = (u.role || '').toLowerCase();
            if (role === 'doctor') {
                doctorsList.push({
                    id: String(u._id),
                    name: u.full_name || 'Doctor',
                    specialization: u.specialization || 'General Dentistry'
                });
            } else if (['patient', 'client'].includes(role) || !role) {
                patientsList.push({
                    _id: String(u._id),
                    patient_id: String(u._id).slice(-6).toUpperCase(),
                    patient_name: u.full_name || 'Patient',
                    full_name: u.full_name || 'Patient',
                    email: u.email || '',
                    phone: u.phone || 'N/A',
                    patient_phone: u.phone || 'N/A',
                    age: u.age || 'N/A',
                    gender: u.gender || 'Other',
                    medical_alerts: u.allergies || u.medical_alerts || 'None recorded',
                    allergies: u.allergies || u.medical_alerts || 'None recorded',
                    status: u.status || 'active',
                    created_at: u.created_at || ''
                });
            }
        }

        const filteredAppts = allAppts.filter(a => {
            const aDate = (a.appointment_date || a.date || '').slice(0, 10);
            if (startDate && aDate < startDate) return false;
            if (endDate && aDate > endDate) return false;

            if (filterDoc !== 'all') {
                const docName = (a.doctor_name || a.attending_doctor || '').toLowerCase();
                if (docName !== filterDoc.toLowerCase()) return false;
            }

            if (filterStat !== 'all') {
                const stat = (a.status || 'scheduled').toLowerCase();
                if (filterStat === 'completed' && stat !== 'completed') return false;
                if (filterStat === 'scheduled' && stat !== 'scheduled') return false;
                if (filterStat === 'waiting' && !['checked_in', 'waiting'].includes(stat)) return false;
                if (filterStat === 'in_progress' && stat !== 'in_progress') return false;
                if (filterStat === 'cancelled' && !['cancelled', 'no_show', 'noshow'].includes(stat)) return false;
            }

            return true;
        });

        // Metrics computation
        let totalCount = filteredAppts.length;
        let completedCount = 0;
        let waitingCount = 0;
        let inProgressCount = 0;
        let scheduledCount = 0;
        let cancelledCount = 0;
        let totalRevenue = 0;

        filteredAppts.forEach(a => {
            const s = (a.status || 'scheduled').toLowerCase();
            const p = a.price !== undefined && a.price !== null && !isNaN(Number(a.price)) ? Number(a.price) : getServicePrice(a.service_name);
            if (s === 'completed') {
                completedCount++;
                totalRevenue += p;
            } else if (['checked_in', 'waiting'].includes(s)) {
                waitingCount++;
            } else if (s === 'in_progress') {
                inProgressCount++;
                totalRevenue += p;
            } else if (s === 'scheduled') {
                scheduledCount++;
            } else if (['cancelled', 'no_show', 'noshow'].includes(s)) {
                cancelledCount++;
            }
        });

        const enrichedRecords = filteredAppts.map(a => {
            const aDate = (a.appointment_date || a.date || '').slice(0, 10);
            const aTime = a.time_slot || a.appointment_time || '09:00 AM';
            const price = a.price !== undefined && a.price !== null && !isNaN(Number(a.price)) ? Number(a.price) : getServicePrice(a.service_name);

            return {
                _id: String(a._id),
                appointment_date: aDate,
                date: aDate,
                time_slot: aTime,
                appointment_time: aTime,
                patient_name: a.patient_name || 'Patient',
                patient_phone: a.patient_phone || '',
                doctor_name: a.doctor_name || a.attending_doctor || 'Assigned Doctor',
                attending_doctor: a.doctor_name || a.attending_doctor || 'Assigned Doctor',
                service_name: a.service_name || 'Dental Consultation',
                operatory_chair: a.operatory_chair || 'Operatory Chair 1',
                status: (a.status || 'scheduled').toLowerCase(),
                price: price,
                formatted_price: formatPhp(price),
                cancellation_reason: a.cancellation_reason || 'N/A',
                queue_number: a.queue_number || null,
                notes: a.notes || '',
                created_at: a.created_at || ''
            };
        });

        // Specific category datasets
        const queuesList = enrichedRecords.filter(r => ['checked_in', 'waiting', 'in_progress', 'completed'].includes(r.status));
        const appointmentsList = enrichedRecords;
        const cancellationsList = enrichedRecords.filter(r => ['cancelled', 'no_show', 'noshow'].includes(r.status));
        const earningsList = enrichedRecords.filter(r => ['completed', 'in_progress'].includes(r.status));
        const auditLogsList = rawAuditLogs.map(a => ({
            _id: String(a._id),
            timestamp: (a.timestamp || a.created_at || '').slice(0, 19).replace('T', ' '),
            actor_name: a.actor_name || a.user_name || 'Staff User',
            user_email: a.user_email || a.actor_email || a.email || 'System',
            role: a.role || a.user_role || 'Staff',
            action: a.action || a.event || 'SYSTEM_EVENT',
            ip_address: a.ip_address || a.ip || '127.0.0.1',
            status: a.status || 'success',
            details: typeof a.details === 'object' ? JSON.stringify(a.details) : (a.details || '')
        }));

        // Determine active records array
        let activeRecords = enrichedRecords;
        if (config.key === 'reports_earnings') activeRecords = earningsList;
        else if (config.key === 'reports_appointments') activeRecords = appointmentsList;
        else if (config.key === 'reports_patients') activeRecords = patientsList;
        else if (config.key === 'reports_queues') activeRecords = queuesList;
        else if (config.key === 'reports_cancellations') activeRecords = cancellationsList;
        else if (config.key === 'reports_audit_logs') activeRecords = auditLogsList;

        return res.status(200).json({
            status: 'success',
            role_scope: `Front Desk Operational & Governance Reports (${config.title})`,
            category: category,
            permission_key: config.key,
            generated_at: new Date().toISOString(),
            date_period: {
                preset: datePreset,
                start_date: startDate || 'All Time',
                end_date: endDate || 'All Time'
            },
            metrics: {
                total_records: activeRecords.length,
                completed_visits: completedCount,
                waiting_queue: waitingCount,
                in_operatory: inProgressCount,
                scheduled_consultations: scheduledCount,
                cancelled_visits: cancelledCount,
                total_service_volume: formatPhp(totalRevenue),
                raw_service_volume: totalRevenue
            },
            doctors: doctorsList,
            records: activeRecords,
            data: {
                records: activeRecords,
                earnings: earningsList,
                appointments: appointmentsList,
                patients: patientsList,
                queues: queuesList,
                cancellations: cancellationsList,
                audit_logs: auditLogsList,
                queue_summary: queuesList,
                appointments_roster: appointmentsList,
                patient_attendance: patientsList,
                daily_collections: earningsList
            }
        });
    } catch (err) {
        console.error('Receptionist reports error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to generate operational reports.' });
    }
});
    } catch (err) {
        console.error('Receptionist reports error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to generate operational reports.' });
    }
});

export default router;


