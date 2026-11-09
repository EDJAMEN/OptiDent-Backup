import express from 'express';
import dbClient from '../config/db.js';
import requireAuth from '../middleware/authGuard.js';
import logAudit from '../config/auditLogger.js';
import { getServicePrice, formatPhp } from '../config/servicePricing.js';
import { ClinicHoursHelper } from '../config/clinicHoursHelper.js';
import { sendAppointmentNotificationEmail, sendPatientOTPEmail, generateGoogleCalendarUrl } from '../config/mailer.js';

const router = express.Router();

// Guard all client routes for patient or admin
router.use(requireAuth(['patient', 'client', 'super_admin', 'admin']));

const DEFAULT_SERVICES = [
    { name: "Dental Consultation & Oral Examination", duration: "30 mins", price: "₱500.00", category: "Diagnostic", description: "Comprehensive dental checkup, soft tissue exam, digital charting, and personalized treatment plan." },
    { name: "Oral Prophylaxis (Dental Cleaning)", duration: "45 mins", price: "₱1,200.00", category: "Preventive", description: "Ultrasonic tartar removal, stain prophylaxis, subgingival scaling, and fluoride polish." },
    { name: "Tooth Restoration / Light-Cure Composite Filling", duration: "60 mins", price: "₱1,500.00 / surface", category: "Restorative", description: "Aesthetic tooth-colored composite resin restoration for cavities, chips, or fractures." },
    { name: "Tooth Extraction (Simple)", duration: "45 mins", price: "₱1,000.00", category: "Oral Surgery", description: "Gentle local anesthesia and tooth removal for unrestorable or loose teeth." },
    { name: "Surgical Odontectomy (Impacted Wisdom Tooth)", duration: "90 mins", price: "₱7,500.00", category: "Oral Surgery", description: "Surgical removal of impacted or partially erupted third molars under local anesthesia." },
    { name: "Root Canal Therapy (Endodontics)", duration: "90 mins", price: "₱6,000.00 / canal", category: "Endodontics", description: "Infected nerve removal, biological canal shaping, disinfectant therapy, and hermetic obturation." },
    { name: "Teeth Whitening / Bleaching", duration: "60 mins", price: "₱8,000.00", category: "Cosmetic", description: "In-clinic professional LED dental whitening session for significant enamel shade brightening." },
    { name: "Orthodontic Bracket Adjustment / Braces", duration: "45 mins", price: "₱1,500.00 / visit", category: "Orthodontics", description: "Monthly archwire realignment, bracket rebonding, power-chain change, and bite progression." }
];

// Helper to retrieve active services with DB support
async function getActiveServicesList() {
    try {
        const dbServices = await dbClient.find('services', { is_active: { $ne: false }, is_deleted: { $ne: true } });
        if (dbServices && dbServices.length > 0) {
            return dbServices.map(s => ({
                name: s.name || s.service_name,
                duration: s.duration || '30 mins',
                price: s.price ? (String(s.price).startsWith('₱') ? s.price : `₱${Number(s.price).toLocaleString('en-US', { minimumFractionDigits: 2 })}`) : '₱500.00',
                category: s.category || 'General Dentistry',
                description: s.description || ''
            }));
        }
    } catch (e) {
        // fallback
    }
    return DEFAULT_SERVICES;
}

const DEFAULT_TIME_SLOTS = [
    '08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM',
    '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM'
];

/**
 * C-002: Client Dashboard Overview
 */
router.get('/get_dashboard_data', async (req, res) => {
    try {
        const user = await dbClient.findOne('users', { _id: req.user.id }) || await dbClient.findOne('users', { email: req.user.email });
        if (!user) {
            return res.status(404).json({ status: 'error', message: 'Patient record not found.' });
        }

        const patientName = user.full_name || '';
        const patientEmail = user.email || '';
        const patientPhone = user.phone || '';
        const todayDate = new Date().toISOString().slice(0, 10);

        // Fetch all appointments
        const allAppts = await dbClient.find('appointments', {});
        const upcoming = [];
        const past = [];
        let completedCount = 0;
        const treatedTeethSet = new Set();

        for (const apt of allAppts) {
            if (apt.is_deleted || apt.is_archived) continue;

            const isMatch = (apt.patient_id && String(apt.patient_id) === String(user._id)) ||
                (apt.patient_email && apt.patient_email.toLowerCase() === patientEmail.toLowerCase()) ||
                (apt.patient_phone && apt.patient_phone === patientPhone) ||
                (apt.patient_name && apt.patient_name.toLowerCase() === patientName.toLowerCase());

            if (!isMatch) continue;

            const aptDate = (apt.appointment_date || apt.date || '').slice(0, 10);
            const status = (apt.status || 'scheduled').toLowerCase();

            const item = {
                _id: String(apt._id),
                date: aptDate,
                time: apt.time_slot || apt.appointment_time || '09:00 AM',
                doctor_name: apt.doctor_name || apt.attending_doctor || 'Assigned Doctor',
                attending_doctor: apt.doctor_name || apt.attending_doctor || 'Assigned Doctor',
                service_name: apt.service_name || 'Dental Consultation',
                price: apt.price !== undefined && apt.price !== null && !isNaN(Number(apt.price)) ? Number(apt.price) : getServicePrice(apt.service_name),
                formatted_price: formatPhp(apt.price !== undefined && apt.price !== null && !isNaN(Number(apt.price)) ? Number(apt.price) : getServicePrice(apt.service_name)),
                treatment_category: apt.treatment_category || 'General Dentistry',
                operatory_chair: apt.operatory_chair || 'Operatory Chair 1',
                status: status,
                queue_number: apt.queue_number || null,
                is_walkin: !!apt.is_walkin,
                notes: apt.procedure_notes || apt.notes || '',
                diagnosis: apt.diagnosis || '',
                teeth_selected: Array.isArray(apt.teeth_selected) ? apt.teeth_selected : (apt.teeth_selected ? [apt.teeth_selected] : []),
                tooth_surfaces: Array.isArray(apt.tooth_surfaces) ? apt.tooth_surfaces : [],
                vital_signs: apt.vital_signs || null,
                procedure_notes: apt.procedure_notes || apt.notes || '',
                prescription: apt.prescription || '',
                post_op_instructions: apt.post_op_instructions || '',
                follow_up_date: apt.follow_up_date || '',
                cancellation_reason: apt.cancellation_reason || apt.decline_reason || '',
                created_at: apt.created_at || ''
            };

            // Collect treated teeth
            item.teeth_selected.forEach(t => treatedTeethSet.add(t));

            if (status === 'completed') {
                completedCount++;
                past.push(item);
            } else if (aptDate >= todayDate && !['completed', 'cancelled'].includes(status)) {
                upcoming.push(item);
            } else {
                past.push(item);
            }
        }

        // Sort upcoming ascending
        upcoming.sort((a, b) => (a.date + ' ' + a.time).localeCompare(b.date + ' ' + b.time));
        // Sort past descending
        past.sort((a, b) => (b.date + ' ' + b.time).localeCompare(a.date + ' ' + a.time));

        // Fetch doctors
        const allUsers = await dbClient.find('users', {});
        const doctors = allUsers
            .filter(u => !u.is_deleted && !u.is_archived && (u.role || '').toLowerCase() === 'doctor' && (u.status || 'active') === 'active')
            .map(u => ({
                id: String(u._id),
                full_name: u.full_name || 'Doctor',
                specialization: u.specialization || 'General Dentistry',
                schedule_days: u.working_days || 'Monday - Saturday',
                working_days: u.working_days || 'Monday - Saturday',
                time_slots: DEFAULT_TIME_SLOTS
            }));

        const settings = await dbClient.findOne('system_settings', { setting_type: 'clinic_profile' }) || {};

        const activeServices = await getActiveServicesList();

        return res.status(200).json({
            status: 'success',
            patient: {
                id: String(user._id),
                full_name: user.full_name,
                email: user.email,
                phone: user.phone || '',
                address: user.address || '',
                dob: user.dob || '',
                blood_type: user.blood_type || 'Unknown',
                emergency_contact_name: user.emergency_contact_name || '',
                emergency_contact_phone: user.emergency_contact_phone || '',
                profile_picture: user.profile_picture || '',
                avatar_color: user.avatar_color || '#0eb1b1',
                reward_points: user.reward_points || 0,
                total_visits: completedCount,
                upcoming_count: upcoming.length,
                treated_teeth_count: treatedTeethSet.size,
                treated_teeth: Array.from(treatedTeethSet)
            },
            upcoming_appointments: upcoming,
            past_appointments: past,
            doctors,
            services: activeServices,
            clinic_settings: {
                clinic_name: settings.clinic_name || 'OptiDent Dental Care Clinic',
                operating_hours: settings.operating_hours || 'Monday - Saturday: 8:00 AM - 5:00 PM',
                time_slots: DEFAULT_TIME_SLOTS,
                integrations: settings.integrations || { patient_rescheduling_enabled: true }
            }
        });
    } catch (err) {
        console.error('Client dashboard error:', err);
        return res.status(500).json({ status: 'error', message: 'Error retrieving patient dashboard.' });
    }
});

/**
 * C-011: Get Clinical Services & Standard Pricing Guide
 */
router.get('/get_services', async (req, res) => {
    try {
        const services = await getActiveServicesList();
        return res.status(200).json({
            status: 'success',
            services: services,
            count: services.length,
            currency: 'PHP',
            currency_symbol: '₱'
        });
    } catch (err) {
        console.error('Error fetching clinical services:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to retrieve clinical services.' });
    }
});

/**
 * C-003: Book Appointment
 */
router.post('/book_appointment', async (req, res) => {
    try {
        const user = await dbClient.findOne('users', { _id: req.user.id }) || await dbClient.findOne('users', { email: req.user.email });
        if (!user) return res.status(404).json({ status: 'error', message: 'User not found.' });

        const body = req.body;
        const date = (body.appointment_date || body.date || '').trim();
        const timeSlot = (body.time_slot || body.time || '').trim();
        const serviceName = (body.service_name || 'Dental Consultation & Oral Examination').trim();
        const doctorName = (body.doctor_name || 'First Available Doctor').trim();
        const doctor = doctorName;
        const notes = (body.notes || '').trim();

        if (!date || !timeSlot) {
            return res.status(400).json({ status: 'error', message: 'Appointment date and time slot are required.' });
        }

        const newAppt = {
            patient_id: String(user._id),
            patient_name: user.full_name,
            patient_email: user.email,
            patient_phone: user.phone || '',
            appointment_date: date,
            date: date,
            time_slot: timeSlot,
            appointment_time: timeSlot,
            doctor_name: doctorName,
            attending_doctor: doctorName,
            service_name: serviceName,
            price: getServicePrice(serviceName, body.price),
            formatted_price: formatPhp(getServicePrice(serviceName, body.price)),
            notes: notes,
            status: 'scheduled',
            operatory_chair: 'Operatory Chair 1',
            is_walkin: false,
            booked_by: user.email,
            is_deleted: false,
            is_archived: false,
            created_at: new Date().toISOString().replace('T', ' ').slice(0, 19)
        };

        const result = await dbClient.insertOne('appointments', newAppt);
        await logAudit(req, 'BOOK_APPOINTMENT', 'CLIENT', { appointment_id: result.insertedId, date, timeSlot }, 'success');

        // Lookup attending doctor's email for notification dispatch
        let doctorEmail = '';
        try {
            const docUser = await dbClient.findOne('users', {
                $or: [
                    { full_name: doctorName },
                    { name: doctorName }
                ]
            });
            if (docUser && docUser.email) doctorEmail = docUser.email;
        } catch (e) {}

        const apptDetails = {
            id: String(result.insertedId || newAppt._id || ''),
            patient_name: user.full_name,
            patient_email: user.email,
            patient_phone: user.phone || '',
            doctor_name: doctor,
            doctor_email: doctorEmail,
            service_name: serviceName,
            date: date,
            time: timeSlot
        };
        const gCalUrl = generateGoogleCalendarUrl(apptDetails);

        // C-009: Record in-app notification & dispatch email + calendar update
        try {
            await dbClient.insertOne('notifications', {
                user_id: user._id,
                user_email: user.email,
                type: 'appointment_booked',
                title: `Appointment Confirmed: ${serviceName}`,
                message: `Your appointment with ${doctor} on ${date} at ${timeSlot} has been confirmed. Present your Digital QR Pass at reception.`,
                channel: 'all',
                is_read: false,
                metadata: {
                    appointment_id: String(result.insertedId),
                    doctor_name: doctor,
                    service_name: serviceName,
                    date: date,
                    time: timeSlot,
                    google_calendar_url: gCalUrl
                },
                created_at: new Date().toISOString()
            });

            // Dispatches to Patient, Super Admin (jamgamer1014@gmail.com), and Attending Doctor
            sendAppointmentNotificationEmail(user.email, user.full_name, apptDetails, 'booked')
                .catch(e => console.warn('[Email Warning] Booking email notification:', e.message));
        } catch (notifErr) {
            console.warn('[Notification Warning] Booking notification record failed:', notifErr.message);
        }

        return res.status(201).json({
            status: 'success',
            message: 'Your dental appointment has been scheduled successfully!',
            appointment_id: result.insertedId,
            google_calendar_url: gCalUrl,
            appointment: apptDetails
        });
    } catch (err) {
        console.error('Book appointment error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to book appointment.' });
    }
});

/**
 * C-004: Reschedule Appointment
 */
router.post('/reschedule_appointment', async (req, res) => {
    try {
        const body = req.body;
        const apptId = body.appointment_id;
        const newDate = body.appointment_date || body.date;
        const newTime = body.time_slot || body.time;
        const docName = body.doctor_name;
        const reason = body.reason || 'Patient rescheduled';

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
            reschedule_reason: reason,
            updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19)
        };
        if (docName) {
            updateData.doctor_name = docName;
            updateData.attending_doctor = docName;
        }

        await dbClient.updateOne('appointments', { _id: apptId }, { $set: updateData });
        await logAudit(req, 'RESCHEDULE_APPOINTMENT', 'CLIENT', { appointment_id: apptId, newDate, newTime }, 'success');

        // C-009: Record in-app notification & dispatch email update
        try {
            await dbClient.insertOne('notifications', {
                user_id: appt.patient_id || req.user.id,
                user_email: appt.patient_email || req.user.email,
                type: 'appointment_rescheduled',
                title: `Appointment Rescheduled: ${appt.service_name || 'Dental Visit'}`,
                message: `Your appointment with ${docName || appt.doctor_name || 'your dentist'} has been moved to ${newDate} at ${newTime}.`,
                channel: 'all',
                is_read: false,
                metadata: {
                    appointment_id: String(appt._id),
                    date: newDate,
                    time: newTime,
                    doctor_name: docName || appt.doctor_name,
                    service_name: appt.service_name
                },
                created_at: new Date().toISOString()
            });

            sendAppointmentNotificationEmail(appt.patient_email || req.user.email, appt.patient_name || req.user.full_name, {
                id: String(appt._id),
                date: newDate,
                time: newTime,
                doctor_name: docName || appt.doctor_name,
                service_name: appt.service_name
            }, 'rescheduled').catch(e => console.warn('[Email Warning] Reschedule email dispatch:', e.message));
        } catch (notifErr) {
            console.warn('[Notification Warning] Reschedule notification failed:', notifErr.message);
        }

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
 * C-005: Cancel Appointment
 */
router.post('/cancel_appointment', async (req, res) => {
    try {
        const body = req.body;
        const apptId = body.appointment_id;
        const reason = body.reason || 'Patient self-service cancellation';

        if (!apptId) return res.status(400).json({ status: 'error', message: 'Appointment ID is required.' });

        const appt = await dbClient.findOne('appointments', { _id: apptId });
        if (!appt) return res.status(404).json({ status: 'error', message: 'Appointment not found.' });

        await dbClient.updateOne('appointments', { _id: apptId }, {
            $set: {
                status: 'cancelled',
                cancellation_reason: reason,
                cancelled_at: new Date().toISOString().replace('T', ' ').slice(0, 19)
            }
        });

        await logAudit(req, 'CANCEL_APPOINTMENT', 'CLIENT', { appointment_id: apptId, reason }, 'success');

        // C-009: Record in-app notification & dispatch email update
        try {
            await dbClient.insertOne('notifications', {
                user_id: appt.patient_id || req.user.id,
                user_email: appt.patient_email || req.user.email,
                type: 'appointment_cancelled',
                title: `Appointment Cancelled: ${appt.service_name || 'Dental Visit'}`,
                message: `Your appointment on ${appt.date || appt.appointment_date} at ${appt.time || appt.time_slot} has been cancelled.`,
                channel: 'all',
                is_read: false,
                metadata: {
                    appointment_id: String(appt._id),
                    date: appt.date || appt.appointment_date,
                    time: appt.time || appt.time_slot,
                    service_name: appt.service_name
                },
                created_at: new Date().toISOString()
            });

            sendAppointmentNotificationEmail(appt.patient_email || req.user.email, appt.patient_name || req.user.full_name, {
                id: String(appt._id),
                date: appt.date || appt.appointment_date,
                time: appt.time || appt.time_slot,
                doctor_name: appt.doctor_name,
                service_name: appt.service_name
            }, 'cancelled').catch(e => console.warn('[Email Warning] Cancel email dispatch:', e.message));
        } catch (notifErr) {
            console.warn('[Notification Warning] Cancel notification failed:', notifErr.message);
        }
        return res.status(200).json({ status: 'success', message: 'Appointment cancelled.' });
    } catch (err) {
        console.error('Cancel appointment error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to cancel appointment.' });
    }
});

/**
 * C-006: Get Available Slots
 */
router.get('/get_available_slots', async (req, res) => {
    try {
        const date = req.query.date;
        const doc = req.query.doctor_name || 'First Available Doctor';
        const excludeApptId = req.query.exclude_appointment_id;

        if (!date) {
            return res.status(400).json({ status: 'error', message: 'Date parameter is required.' });
        }

        // Check booked appointments on that date
        const allAppts = await dbClient.find('appointments', { appointment_date: date });
        const takenSlots = allAppts
            .filter(a => !a.is_deleted && !a.is_archived && a.status !== 'cancelled' && String(a._id) !== String(excludeApptId))
            .map(a => a.time_slot || a.appointment_time);

        let isOnDuty = true;
        let dutyMessage = 'Clinic is open and accepting appointments.';
        let baseSlots = [...DEFAULT_TIME_SLOTS];
        let isCustomShift = false;
        let shiftHours = null;

        if (doc && doc !== 'First Available Doctor') {
            const doctorUser = await dbClient.findOne('users', { full_name: doc });
            if (doctorUser) {
                const offDates = Array.isArray(doctorUser.off_duty_dates) ? doctorUser.off_duty_dates : [];
                if (offDates.includes(date)) {
                    isOnDuty = false;
                    dutyMessage = `Dr. ${doc} is marked off-duty on this date (${date}) due to a personal schedule exception.`;
                } else if (doctorUser.custom_date_hours && doctorUser.custom_date_hours[date]) {
                    const custom = doctorUser.custom_date_hours[date];
                    isCustomShift = true;
                    shiftHours = `${custom.start} - ${custom.end}`;
                    baseSlots = ClinicHoursHelper.generateSlots(custom.start, custom.end, false);
                    dutyMessage = `Dr. ${doc} is working a modified shift (${shiftHours}) on this date.`;
                } else if (Array.isArray(doctorUser.time_slots) && doctorUser.time_slots.length > 0) {
                    baseSlots = doctorUser.time_slots;
                }
            }
        }

        if (!isOnDuty) {
            return res.status(200).json({
                status: 'success',
                date,
                doctor_name: doc,
                is_on_duty: false,
                is_custom_shift: false,
                duty_message: dutyMessage,
                available_count: 0,
                booked_count: 0,
                slots: []
            });
        }

        const mappedSlots = baseSlots.map(slotTime => {
            const isTaken = takenSlots.includes(slotTime);
            return {
                time: slotTime,
                available: !isTaken,
                status: isTaken ? 'booked' : 'available',
                status_label: isTaken ? 'Booked' : 'Available'
            };
        });

        return res.status(200).json({
            status: 'success',
            date,
            doctor_name: doc,
            is_on_duty: true,
            is_custom_shift: isCustomShift,
            shift_hours: shiftHours,
            duty_message: dutyMessage,
            available_count: mappedSlots.filter(s => s.available).length,
            booked_count: mappedSlots.filter(s => !s.available).length,
            slots: mappedSlots
        });
    } catch (err) {
        console.error('Slot fetch error:', err);
        return res.status(500).json({ status: 'error', message: 'Error checking availability.' });
    }
});

/**
 * C-007: Clinical Medical History Dossier
 */
router.get('/get_medical_history', async (req, res) => {
    try {
        const user = await dbClient.findOne('users', { _id: req.user.id }) || await dbClient.findOne('users', { email: req.user.email });
        if (!user) return res.status(404).json({ status: 'error', message: 'User not found.' });

        const appts = await dbClient.find('appointments', {});
        const myAppts = appts.filter(a =>
            !a.is_deleted && !a.is_archived &&
            (String(a.patient_id) === String(user._id) || (a.patient_email && a.patient_email.toLowerCase() === user.email.toLowerCase()))
        );

        const completed = myAppts.filter(a => (a.status || '').toLowerCase() === 'completed');
        const treatedTeethSet = new Set();
        const timeline = [];

        for (const c of completed) {
            const teeth = Array.isArray(c.teeth_selected) ? c.teeth_selected : [];
            teeth.forEach(t => treatedTeethSet.add(t));
            timeline.push({
                date: c.appointment_date || c.date,
                time: c.time_slot || c.appointment_time,
                service: c.service_name,
                dentist: c.doctor_name || c.attending_doctor,
                diagnosis: c.diagnosis || '',
                procedure_notes: c.procedure_notes || c.notes,
                teeth_involved: teeth,
                status: c.status
            });
        }

        return res.status(200).json({
            status: 'success',
            patient: {
                name: user.full_name,
                dob: user.dob || '',
                age: '24',
                gender: user.gender || 'Not Specified',
                blood_type: user.blood_type || 'O+',
                phone: user.phone || '',
                emergency_contact: `${user.emergency_contact_name || ''} (${user.emergency_contact_phone || ''})`,
                total_completed_visits: completed.length
            },
            treated_teeth_summary: Array.from(treatedTeethSet),
            allergies: user.allergies ? [{ name: user.allergies, severity: 'None', notes: '' }] : [],
            current_medications: [],
            clinical_precautions: 'Standard clinical dental hygiene protocol.',
            treatment_history_timeline: timeline
        });
    } catch (err) {
        console.error('Medical history error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to retrieve medical history.' });
    }
});

/**
 * C-008: Profile Customization
 */
router.post('/update_profile', async (req, res) => {
    try {
        const user = await dbClient.findOne('users', { _id: req.user.id }) || await dbClient.findOne('users', { email: req.user.email });
        if (!user) return res.status(404).json({ status: 'error', message: 'User not found.' });

        const body = req.body;
        const fullName = (body.full_name || '').trim();
        const email = (body.email || '').trim().toLowerCase();
        const phone = (body.phone || '').trim();
        const address = (body.address || '').trim();
        const emergName = (body.emergency_contact_name || '').trim();
        const emergPhone = (body.emergency_contact_phone || '').trim();
        const profilePicture = body.profile_picture || '';
        const avatarColor = body.avatar_color || '#0eb1b1';

        if (!fullName || !email) {
            return res.status(400).json({ status: 'error', message: 'Full name and email are required.' });
        }

        // Email conflict check
        if (email !== user.email.toLowerCase()) {
            const conflict = await dbClient.findOne('users', { email });
            if (conflict && String(conflict._id) !== String(user._id)) {
                return res.status(409).json({ status: 'error', message: 'This email is already in use by another account.' });
            }
        }

        const updateDoc = {
            full_name: fullName,
            email: email,
            phone: phone,
            address: address,
            emergency_contact_name: emergName,
            emergency_contact_phone: emergPhone,
            avatar_color: avatarColor,
            updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19)
        };
        if (profilePicture) {
            updateDoc.profile_picture = profilePicture;
        }

        await dbClient.updateOne('users', { _id: user._id }, { $set: updateDoc });

        // Update in session
        req.session.email = email;
        req.session.full_name = fullName;

        await logAudit(req, 'UPDATE_PROFILE', 'CLIENT', { full_name: fullName, email }, 'success');

        return res.status(200).json({
            status: 'success',
            message: 'Profile updated successfully!',
            patient: {
                id: String(user._id),
                full_name: fullName,
                email: email,
                phone: phone,
                address: address,
                emergency_contact_name: emergName,
                emergency_contact_phone: emergPhone,
                profile_picture: profilePicture || user.profile_picture || '',
                avatar_color: avatarColor
            }
        });
    } catch (err) {
        console.error('Update profile error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to update profile.' });
    }
});

/**
 * C-001 Step 2: Complete Profile & Clinical Safety Details
 */
router.post('/complete_profile', async (req, res) => {
    try {
        const userId = req.session.user_id || req.user.id;
        const userEmail = req.session.email || req.user.email;

        const body = req.body;
        const phone = (body.phone || '').trim();
        const dob = (body.dob || '').trim();
        const gender = (body.gender || 'Not Specified').trim();
        const bloodType = (body.blood_type || 'Unknown').trim();
        const address = (body.address || '').trim();
        const allergies = (body.allergies || body.medical_alerts || 'None recorded').trim();
        const emergName = (body.emergency_contact_name || '').trim();
        const emergPhone = (body.emergency_contact_phone || '').trim();

        let age = null;
        if (dob) {
            const birthDate = new Date(dob);
            const today = new Date();
            age = today.getFullYear() - birthDate.getFullYear();
        }

        const filter = userId ? { _id: userId } : { email: userEmail };
        const updateFields = {
            phone,
            dob,
            age,
            gender,
            blood_type: bloodType,
            address,
            allergies: allergies || 'None recorded',
            medical_alerts: allergies || 'None recorded',
            emergency_contact_name: emergName,
            emergency_contact_phone: emergPhone,
            profile_completed: true,
            updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19)
        };

        await dbClient.updateOne('users', filter, { $set: updateFields });
        await logAudit(req, 'PATIENT_PROFILE_COMPLETED', 'users:' + userEmail, { email: userEmail, phone }, 'success');

        return res.status(200).json({
            status: 'success',
            message: 'Personal information and clinical safety details saved successfully!',
            redirect: 'client_dashboard.html'
        });
    } catch (err) {
        console.error('Complete profile error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to complete profile.' });
    }
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * C-009: Notifications & OTP Verification API
 * ─────────────────────────────────────────────────────────────────────────────
 */

// 1. Get Patient Notifications and Unread Count
router.get('/get_notifications', async (req, res) => {
    try {
        const user = await dbClient.findOne('users', { _id: req.user.id }) || await dbClient.findOne('users', { email: req.user.email });
        if (!user) return res.status(404).json({ status: 'error', message: 'User not found.' });

        const allNotifs = await dbClient.find('notifications', {});
        const userNotifs = allNotifs
            .filter(n => String(n.user_id) === String(user._id) || (n.user_email && n.user_email.toLowerCase() === user.email.toLowerCase()))
            .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
            .slice(0, 50);

        const unreadCount = userNotifs.filter(n => !n.is_read).length;

        return res.status(200).json({
            status: 'success',
            notifications: userNotifs,
            unread_count: unreadCount,
            is_verified: !!(user.is_verified || user.email_verified || user.google_id),
            preferences: user.notification_preferences || {
                email_notifications: true,
                sms_notifications: true,
                appointment_reminders: true
            }
        });
    } catch (err) {
        console.error('Get notifications error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to load notifications.' });
    }
});

// 2. Mark Notification(s) as Read
router.post('/mark_notification_read', async (req, res) => {
    try {
        const user = await dbClient.findOne('users', { _id: req.user.id }) || await dbClient.findOne('users', { email: req.user.email });
        if (!user) return res.status(404).json({ status: 'error', message: 'User not found.' });

        const { id, mark_all } = req.body;

        if (mark_all) {
            const allNotifs = await dbClient.find('notifications', {});
            for (const n of allNotifs) {
                if ((String(n.user_id) === String(user._id) || (n.user_email && n.user_email.toLowerCase() === user.email.toLowerCase())) && !n.is_read) {
                    await dbClient.updateOne('notifications', { _id: n._id }, { $set: { is_read: true } });
                }
            }
            return res.status(200).json({ status: 'success', message: 'All notifications marked as read.' });
        }

        if (id) {
            await dbClient.updateOne('notifications', { _id: id }, { $set: { is_read: true } });
            return res.status(200).json({ status: 'success', message: 'Notification marked as read.' });
        }

        return res.status(400).json({ status: 'error', message: 'Notification ID or mark_all flag required.' });
    } catch (err) {
        console.error('Mark read error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to update notification.' });
    }
});

// 3. Send Patient Account Verification OTP (Email / SMS)
router.post('/send_otp', async (req, res) => {
    try {
        const user = await dbClient.findOne('users', { _id: req.user.id }) || await dbClient.findOne('users', { email: req.user.email });
        if (!user) return res.status(404).json({ status: 'error', message: 'User not found.' });

        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();

        // Save to email_verifications
        try {
            await dbClient.deleteMany('email_verifications', { email: user.email.toLowerCase() });
        } catch (e) {}

        await dbClient.insertOne('email_verifications', {
            email: user.email.toLowerCase(),
            full_name: user.full_name,
            code: code,
            created_at: now.toISOString(),
            expires_at: expiresAt,
            verified: false
        });

        // Record security notification
        await dbClient.insertOne('notifications', {
            user_id: user._id,
            user_email: user.email,
            type: 'security_otp',
            title: 'Account Verification OTP Generated',
            message: `A 6-digit verification code has been dispatched to ${user.email}. Code expires in 10 minutes.`,
            channel: 'all',
            is_read: false,
            created_at: now.toISOString()
        });

        // Dispatch email OTP
        sendPatientOTPEmail(user.email, user.full_name, code).catch(e => console.warn('[OTP Mailer Warning]:', e.message));

        await logAudit(req, 'PATIENT_OTP_REQUESTED', 'CLIENT', { email: user.email }, 'success');

        return res.status(200).json({
            status: 'success',
            message: `A 6-digit verification OTP has been dispatched to ${user.email}.`,
            email: user.email,
            expires_in: 600
        });
    } catch (err) {
        console.error('Send OTP error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to generate verification OTP.' });
    }
});

// 4. Verify OTP Code
router.post('/verify_otp', async (req, res) => {
    try {
        const user = await dbClient.findOne('users', { _id: req.user.id }) || await dbClient.findOne('users', { email: req.user.email });
        if (!user) return res.status(404).json({ status: 'error', message: 'User not found.' });

        const inputCode = (req.body.code || '').trim();
        if (!inputCode) {
            return res.status(400).json({ status: 'error', message: 'Verification code is required.' });
        }

        const record = await dbClient.findOne('email_verifications', {
            email: user.email.toLowerCase(),
            code: inputCode
        });

        if (!record) {
            return res.status(400).json({ status: 'error', message: 'Invalid verification code. Please check and try again.' });
        }

        if (new Date() > new Date(record.expires_at)) {
            return res.status(400).json({ status: 'error', message: 'Verification code has expired. Please request a new one.' });
        }

        // Mark user verified
        await dbClient.updateOne('users', { _id: user._id }, {
            $set: {
                is_verified: true,
                email_verified: true,
                verified_at: new Date().toISOString()
            }
        });

        // Mark verification used
        await dbClient.updateOne('email_verifications', { _id: record._id }, { $set: { verified: true } });

        // Create success notification
        await dbClient.insertOne('notifications', {
            user_id: user._id,
            user_email: user.email,
            type: 'security_otp',
            title: 'Account Security Verified',
            message: 'Your OptiDent patient account and identity have been verified with 2-Factor OTP security.',
            channel: 'all',
            is_read: false,
            created_at: new Date().toISOString()
        });

        await logAudit(req, 'PATIENT_OTP_VERIFIED', 'CLIENT', { email: user.email }, 'success');

        return res.status(200).json({
            status: 'success',
            message: 'Identity & account verified successfully! Verified Patient badge activated.'
        });
    } catch (err) {
        console.error('Verify OTP error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to verify code.' });
    }
});

// 5. Update Notification Preferences
router.post('/update_notification_preferences', async (req, res) => {
    try {
        const user = await dbClient.findOne('users', { _id: req.user.id }) || await dbClient.findOne('users', { email: req.user.email });
        if (!user) return res.status(404).json({ status: 'error', message: 'User not found.' });

        const body = req.body;
        const preferences = {
            email_notifications: body.email_notifications !== false,
            sms_notifications: body.sms_notifications !== false,
            appointment_reminders: body.appointment_reminders !== false,
            updated_at: new Date().toISOString()
        };

        await dbClient.updateOne('users', { _id: user._id }, { $set: { notification_preferences: preferences } });

        return res.status(200).json({
            status: 'success',
            message: 'Notification & SMS alerts preferences saved successfully.',
            preferences
        });
    } catch (err) {
        console.error('Preferences update error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to update preferences.' });
    }
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * C-010: Calendar, Time/Date & QR Code Support API
 * ─────────────────────────────────────────────────────────────────────────────
 */

// 1. Get Appointment Details & Check-In QR Pass
router.get('/get_appointment_qr', async (req, res) => {
    try {
        const apptId = req.query.appointment_id || req.query.id;
        if (!apptId) return res.status(400).json({ status: 'error', message: 'Appointment ID required.' });

        const appt = await dbClient.findOne('appointments', { _id: apptId });
        if (!appt) return res.status(404).json({ status: 'error', message: 'Appointment not found.' });

        const refCode = `OPT-APT-${String(appt._id).slice(-6).toUpperCase()}`;
        const checkinPayload = {
            clinic: 'OptiDent Dental Clinic',
            ref: refCode,
            appointment_id: String(appt._id),
            patient_name: appt.patient_name || req.user.full_name || 'Patient',
            doctor_name: appt.doctor_name || 'Assigned Dental Specialist',
            service_name: appt.service_name || 'Dental Consultation',
            date: appt.appointment_date || appt.date,
            time: appt.time_slot || appt.appointment_time,
            operatory: appt.operatory_chair || 'Operatory Chair 1',
            status: appt.status || 'scheduled',
            token: Buffer.from(`${refCode}:${appt.appointment_date || appt.date}`).toString('base64')
        };

        return res.status(200).json({
            status: 'success',
            ref_code: refCode,
            pass: checkinPayload,
            qr_string: JSON.stringify(checkinPayload)
        });
    } catch (err) {
        console.error('QR Pass fetch error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to generate QR pass.' });
    }
});

// 2. Export Standard iCalendar (.ics) File for Apple, Google & Outlook Calendar
router.get('/get_appointment_ics', async (req, res) => {
    try {
        const apptId = req.query.appointment_id || req.query.id;
        if (!apptId) return res.status(400).send('Appointment ID required.');

        const appt = await dbClient.findOne('appointments', { _id: apptId });
        if (!appt) return res.status(404).send('Appointment not found.');

        const dateStr = (appt.appointment_date || appt.date || '').trim();
        const timeStr = (appt.time_slot || appt.appointment_time || '09:00 AM').trim();
        const service = appt.service_name || 'Dental Consultation';
        const doctor = appt.doctor_name || 'Dentist';
        const chair = appt.operatory_chair || 'Operatory Room';

        // Parse date and time into UTC timestamp
        const timeMatch = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
        let hour = 9;
        let minute = 0;
        if (timeMatch) {
            hour = parseInt(timeMatch[1], 10);
            minute = parseInt(timeMatch[2], 10);
            if (timeMatch[3].toUpperCase() === 'PM' && hour !== 12) hour += 12;
            if (timeMatch[3].toUpperCase() === 'AM' && hour === 12) hour = 0;
        }

        const pad = n => String(n).padStart(2, '0');
        const dParts = dateStr.split('-');
        const y = dParts[0] || '2026';
        const m = dParts[1] || '11';
        const d = dParts[2] || '25';

        // Format for iCalendar in local floating time
        const dtStart = `${y}${m}${d}T${pad(hour)}${pad(minute)}00`;
        const endHour = hour + 1; // 1-hour appointment block
        const dtEnd = `${y}${m}${d}T${pad(endHour)}${pad(minute)}00`;
        const dtStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

        const icsContent = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//OptiDent Dental Clinic//Appointment Booking Portal//EN',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'BEGIN:VEVENT',
            `UID:OPT-APT-${String(appt._id)}@optident.clinic`,
            `DTSTAMP:${dtStamp}`,
            `DTSTART:${dtStart}`,
            `DTEND:${dtEnd}`,
            `SUMMARY:OptiDent Dental Visit: ${service}`,
            `DESCRIPTION:Dental Treatment with ${doctor}. Operatory Station: ${chair}. Please arrive 10 minutes prior with your Digital QR Pass.`,
            'LOCATION:OptiDent Dental Clinic, Fortich St., Malaybalay City, Bukidnon',
            'STATUS:CONFIRMED',
            'BEGIN:VALARM',
            'TRIGGER:-PT2H',
            'ACTION:DISPLAY',
            `DESCRIPTION:Reminder: Dental appointment in 2 hours with ${doctor} at OptiDent`,
            'END:VALARM',
            'END:VEVENT',
            'END:VCALENDAR'
        ].join('\r\n');

        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="OptiDent-Appointment-${dateStr}.ics"`);
        return res.send(icsContent);
    } catch (err) {
        console.error('ICS export error:', err);
        return res.status(500).send('Failed to generate calendar event.');
    }
});

export default router;


