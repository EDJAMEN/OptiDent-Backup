import express from 'express';
import dbClient from '../config/db.js';
import requireAuth from '../middleware/authGuard.js';
import logAudit from '../config/auditLogger.js';

const router = express.Router();

// Guard all client routes for patient or admin
router.use(requireAuth(['patient', 'client', 'super_admin', 'admin']));

const DEFAULT_SERVICES = [
    { name: "Dental Consultation & Oral Examination", duration: "30 mins", price: "₱500.00", category: "Diagnostic" },
    { name: "Oral Prophylaxis (Dental Cleaning)", duration: "45 mins", price: "₱1,200.00", category: "Preventive" },
    { name: "Tooth Restoration / Light-Cure Composite Filling", duration: "60 mins", price: "₱1,500.00 / surface", category: "Restorative" },
    { name: "Tooth Extraction (Simple)", duration: "45 mins", price: "₱1,000.00", category: "Oral Surgery" },
    { name: "Surgical Odontectomy (Impacted Wisdom Tooth)", duration: "90 mins", price: "₱7,500.00", category: "Oral Surgery" },
    { name: "Root Canal Therapy (Endodontics)", duration: "90 mins", price: "₱6,000.00 / canal", category: "Endodontics" },
    { name: "Teeth Whitening / Bleaching", duration: "60 mins", price: "₱8,000.00", category: "Cosmetic" },
    { name: "Orthodontic Bracket Adjustment / Braces", duration: "45 mins", price: "₱1,500.00 / visit", category: "Orthodontics" }
];

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
            services: DEFAULT_SERVICES,
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

        return res.status(201).json({
            status: 'success',
            message: 'Your dental appointment has been scheduled successfully!',
            appointment_id: result.insertedId
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

        const availableSlots = DEFAULT_TIME_SLOTS.filter(slot => !takenSlots.includes(slot));

        return res.status(200).json({
            status: 'success',
            date,
            doctor_name: doc,
            is_on_duty: true,
            duty_message: 'Clinic is open and accepting appointments.',
            slots: availableSlots
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

export default router;


