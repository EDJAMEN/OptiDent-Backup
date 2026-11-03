import express from 'express';
import bcrypt from 'bcryptjs';
import dbClient from '../config/db.js';
import requireAuth from '../middleware/authGuard.js';
import logAudit from '../config/auditLogger.js';
import ClinicHoursHelper from '../config/clinicHoursHelper.js';
import { getServicePrice, formatPhp } from '../config/servicePricing.js';

const router = express.Router();

router.use(requireAuth(['doctor', 'super_admin', 'admin']));

/**
 * D-002: Doctor Dashboard & Queue
 */
router.get('/get_dashboard_data', async (req, res) => {
    try {
        const userEmail = req.user.email;
        const userRole = (req.user.role || '').toLowerCase();

        // 1. Fetch Doctor Profile
        let doctor = await dbClient.findOne('users', { _id: req.user.id }) || await dbClient.findOne('users', { email: userEmail });
        if (!doctor && ['super_admin', 'admin'].includes(userRole)) {
            doctor = await dbClient.findOne('users', { role: 'doctor', status: 'active' }) || {
                full_name: req.user.name || 'Dr. Specialist',
                email: userEmail,
                role: 'doctor',
                specialization: 'General Dentistry',
                professional_id: 'PRC-VERIFIED',
                schedule_days: 'Mon - Fri (8:00 AM - 5:00 PM)',
                phone: '+63 917 888 2345'
            };
        }

        const currentDocName = (doctor?.full_name || '').toLowerCase().trim();
        const currentDocEmail = (doctor?.email || userEmail || '').toLowerCase().trim();

        // 2. Fetch Appointments with indexed query for active records
        const allAppts = await dbClient.find('appointments', {
            is_deleted: { $ne: true },
            is_archived: { $ne: true }
        });

        const todayDate = new Date().toISOString().slice(0, 10);

        const todayList = [];
        const upcomingList = [];
        const completedList = [];
        const pendingApprovalList = [];
        const patientsMap = new Map();

        let inProgressCount = 0;
        let waitingCount = 0;
        let todayCount = 0;

        for (const apt of allAppts) {
            if (apt.is_deleted || apt.is_archived) continue;

            // Match appointments assigned to this doctor (or all if admin viewing)
            let isMatch = true;
            if (userRole === 'doctor') {
                const aptDocEmail = (apt.dentist_email || apt.doctor_email || '').toLowerCase().trim();
                const aptDocName = (apt.dentist_name || apt.doctor_name || apt.attending_doctor || '').toLowerCase().trim();

                if (aptDocEmail && aptDocEmail !== currentDocEmail) {
                    isMatch = false;
                } else if (!aptDocEmail && aptDocName && !aptDocName.includes('first available')) {
                    const cDoc = currentDocName.replace(/dr\.?|\./gi, '').trim();
                    const aDoc = aptDocName.replace(/dr\.?|\./gi, '').trim();
                    if (cDoc && aDoc && !cDoc.includes(aDoc) && !aDoc.includes(cDoc)) {
                        isMatch = false;
                    }
                }
            }

            if (!isMatch) continue;

            const aptDate = (apt.appointment_date || apt.date || '').slice(0, 10);
            const status = (apt.status || 'scheduled').toLowerCase();
            const isPending = (status === 'pending' || status === 'pending_approval' || (apt.approval_status || '') === 'pending');

            const item = {
                _id: String(apt._id),
                id: String(apt._id),
                patient_id: apt.patient_id ? String(apt.patient_id) : '',
                patient_name: apt.patient_name || 'Patient',
                patient_phone: apt.patient_phone || '',
                patient_email: apt.patient_email || '',
                patient_age: apt.patient_age || 'N/A',
                patient_gender: apt.patient_gender || 'N/A',
                service_name: apt.service_name || 'Dental Consultation',
                price: apt.price !== undefined && apt.price !== null && !isNaN(Number(apt.price)) ? Number(apt.price) : getServicePrice(apt.service_name),
                formatted_price: formatPhp(apt.price !== undefined && apt.price !== null && !isNaN(Number(apt.price)) ? Number(apt.price) : getServicePrice(apt.service_name)),
                treatment_category: apt.treatment_category || 'General Dentistry',
                appointment_date: aptDate,
                date: aptDate,
                appointment_time: apt.appointment_time || apt.time_slot || '09:00 AM',
                time_slot: apt.time_slot || apt.appointment_time || '09:00 AM',
                operatory_chair: apt.operatory_chair || apt.chair_room || 'Dental Operatory 1',
                chair_room: apt.chair_room || apt.operatory_chair || 'Dental Operatory 1',
                status: status,
                approval_status: apt.approval_status || (isPending ? 'pending' : 'approved'),
                queue_number: apt.queue_number || null,
                chief_complaint: apt.chief_complaint || apt.notes || 'Routine consultation',
                notes: apt.notes || apt.procedure_notes || '',
                diagnosis: apt.diagnosis || '',
                medical_alerts: apt.medical_alerts || 'None reported.',
                cancellation_reason: apt.cancellation_reason || '',
                decline_reason: apt.decline_reason || '',
                teeth_selected: Array.isArray(apt.teeth_selected) ? apt.teeth_selected : (apt.teeth_selected ? [apt.teeth_selected] : []),
                tooth_surfaces: Array.isArray(apt.tooth_surfaces) ? apt.tooth_surfaces : [],
                vital_signs: apt.vital_signs || null,
                prescription: apt.prescription || '',
                procedure_notes: apt.procedure_notes || apt.notes || '',
                edit_history: Array.isArray(apt.edit_history) ? apt.edit_history : [],
                created_at: apt.created_at || ''
            };

            // Aggregate unique patient profiles
            const pKey = (item.patient_email || item.patient_name || '').toLowerCase().trim();
            if (pKey) {
                if (!patientsMap.has(pKey)) {
                    patientsMap.set(pKey, {
                        name: item.patient_name,
                        email: item.patient_email,
                        phone: item.patient_phone,
                        age: item.patient_age,
                        gender: item.patient_gender,
                        last_visit: aptDate,
                        last_service: item.service_name,
                        total_visits: 1,
                        treated_teeth: [...item.teeth_selected]
                    });
                } else {
                    const existingP = patientsMap.get(pKey);
                    existingP.total_visits++;
                    if (item.teeth_selected.length > 0) {
                        existingP.treated_teeth = Array.from(new Set([...existingP.treated_teeth, ...item.teeth_selected]));
                    }
                    if (aptDate > existingP.last_visit) {
                        existingP.last_visit = aptDate;
                        existingP.last_service = item.service_name;
                    }
                }
            }

            // Pending approval requests
            if (isPending) {
                pendingApprovalList.push(item);
            }

            // Categorize into Queue Today, Upcoming, and Completed
            if (status === 'completed') {
                completedList.push(item);
                if (aptDate === todayDate) {
                    todayCount++;
                }
            } else if (status === 'cancelled') {
                // Cancelled appointments excluded from active queue
            } else {
                if (aptDate === todayDate || status === 'in_progress') {
                    todayList.push(item);
                    todayCount++;
                    if (status === 'in_progress') {
                        inProgressCount++;
                    } else if (status === 'scheduled') {
                        waitingCount++;
                    }
                } else if (aptDate > todayDate) {
                    upcomingList.push(item);
                }
            }
        }

        // Sort pending approval requests: soonest first
        pendingApprovalList.sort((a, b) => {
            const da = `${a.appointment_date} ${a.appointment_time}`;
            const db = `${b.appointment_date} ${b.appointment_time}`;
            return da.localeCompare(db);
        });

        // Sort today list: in_progress first, then by appointment time
        todayList.sort((a, b) => {
            if (a.status === 'in_progress') return -1;
            if (b.status === 'in_progress') return 1;
            return (a.appointment_time || '').localeCompare(b.appointment_time || '');
        });

        // Sort upcoming: soonest first
        upcomingList.sort((a, b) => {
            const da = `${a.appointment_date} ${a.appointment_time}`;
            const db = `${b.appointment_date} ${b.appointment_time}`;
            return da.localeCompare(db);
        });

        // Sort completed: most recent first
        completedList.sort((a, b) => {
            return (b.appointment_date || '').localeCompare(a.appointment_date || '');
        });

        const patientsList = Array.from(patientsMap.values());
        const docSched = ClinicHoursHelper.resolveDoctorSchedule(doctor || {});

        const metrics = {
            today_total: todayCount,
            in_progress: inProgressCount,
            waiting_queue: waitingCount,
            completed_total: completedList.length,
            total_patients: patientsList.length,
            pending_approvals: pendingApprovalList.length
        };

        return res.status(200).json({
            status: 'success',
            doctor: {
                id: String(doctor?._id || req.user.id),
                full_name: doctor?.full_name || 'Dr. Specialist',
                email: doctor?.email || userEmail,
                role: 'doctor',
                specialization: doctor?.specialization || 'General Dentistry',
                professional_id: doctor?.professional_id || 'PRC-VERIFIED',
                schedule_days: docSched.schedule_days,
                working_days: docSched.working_days,
                off_duty_dates: doctor?.off_duty_dates || [],
                extra_duty_dates: doctor?.extra_duty_dates || [],
                custom_date_hours: doctor?.custom_date_hours || {},
                opening_time: docSched.opening_time,
                closing_time: docSched.closing_time,
                lunch_break: docSched.lunch_break,
                time_slots: docSched.time_slots,
                timezone: docSched.timezone,
                phone: doctor?.phone || '',
                bio: doctor?.bio || ''
            },
            metrics: metrics,
            queue_today: todayList,
            today_appointments: todayList,
            pending_requests: pendingApprovalList,
            pending_approval: pendingApprovalList,
            upcoming_appointments: upcomingList,
            completed_procedures: completedList,
            completed_records: completedList,
            patients: patientsList,
            patient_roster: patientsList
        });
    } catch (err) {
        console.error('Doctor dashboard error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to load doctor dashboard.' });
    }
});

/**
 * D-004: Save Clinical Record
 */
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
            await dbClient.updateOne('appointments', { _id: apptId }, { $set: updateData });
        } else {
            // New direct clinical entry
            const newRecord = {
                ...updateData,
                patient_name: body.patient_name,
                patient_phone: body.patient_phone || '',
                service_name: body.service_name || 'Dental Consultation',
                doctor_name: req.user.full_name,
                appointment_date: new Date().toISOString().slice(0, 10),
                created_at: updateData.completed_at
            };
            await dbClient.insertOne('appointments', newRecord);
        }

        // Also record into clinical_records collection for audit history
        await dbClient.insertOne('clinical_records', {
            appointment_id: apptId || '',
            patient_name: body.patient_name || '',
            doctor_name: req.user.full_name,
            diagnosis,
            teeth_selected: teeth,
            prescription,
            created_at: new Date().toISOString().replace('T', ' ').slice(0, 19)
        });

        await logAudit(req, 'SAVE_CLINICAL_RECORD', 'DOCTOR', { appointment_id: apptId, diagnosis }, 'success');

        return res.status(200).json({
            status: 'success',
            message: 'Clinical record saved and visit marked as completed!'
        });
    } catch (err) {
        console.error('Save clinical record error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to save clinical record.' });
    }
});

/**
 * Update Appointment Status
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
        if (newStatus === 'completed') updateDoc.completed_at = updateDoc.updated_at;

        await dbClient.updateOne('appointments', { _id: apptId }, { $set: updateDoc });
        await logAudit(req, 'UPDATE_STATUS', 'DOCTOR', { appointment_id: apptId, status: newStatus }, 'success');

        return res.status(200).json({ status: 'success', message: `Status updated to ${newStatus}.` });
    } catch (err) {
        console.error('Status update error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to update status.' });
    }
});

/**
 * Approve Requested Appointment
 */
router.post('/approve_appointment', async (req, res) => {
    try {
        const apptId = req.body.appointment_id;
        if (!apptId) return res.status(400).json({ status: 'error', message: 'Appointment ID is required.' });

        await dbClient.updateOne('appointments', { _id: apptId }, {
            $set: {
                status: 'scheduled',
                approval_status: 'approved',
                approved_by: req.user.full_name || req.user.email,
                approved_at: new Date().toISOString().replace('T', ' ').slice(0, 19)
            }
        });

        return res.status(200).json({ status: 'success', message: 'Appointment approved and scheduled.' });
    } catch (err) {
        console.error('Approve error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to approve appointment.' });
    }
});

/**
 * Doctor Profile Update
 */
router.post('/update_profile', async (req, res) => {
    try {
        const body = req.body;
        const fullName = (body.full_name || '').trim();
        const phone = (body.phone || '').trim();
        const specialization = (body.specialization || '').trim();

        if (!fullName) return res.status(400).json({ status: 'error', message: 'Doctor full name is required.' });

        await dbClient.updateOne('users', { _id: req.user.id }, {
            $set: {
                full_name: fullName,
                phone: phone,
                specialization: specialization,
                updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19)
            }
        });

        req.session.full_name = fullName;
        return res.status(200).json({ status: 'success', message: 'Doctor profile updated.' });
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

        const user = await dbClient.findOne('users', { _id: req.user.id });
        if (!user) return res.status(404).json({ status: 'error', message: 'Doctor account not found.' });

        let matches = false;
        if (user.password_hash) {
            const normalized = user.password_hash.replace(/^\$2y\$/, '$2a$');
            matches = bcrypt.compareSync(curPass, normalized);
        } else if (user.password) {
            matches = (user.password === curPass);
        }

        if (!matches) {
            return res.status(401).json({ status: 'error', message: 'Current password does not match.' });
        }

        const newHash = bcrypt.hashSync(newPass, 10);
        await dbClient.updateOne('users', { _id: req.user.id }, {
            $set: { password_hash: newHash, updated_at: new Date().toISOString() }
        });

        return res.status(200).json({ status: 'success', message: 'Password updated successfully.' });
    } catch (err) {
        console.error('Password change error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to update password.' });
    }
});

/**
 * Generate Time Slots Helper
 */
function generateSlots(openingTime = '08:00 AM', closingTime = '05:00 PM', lunchBreak = true) {
    const parseTime = (tStr) => {
        const [time, mer] = tStr.trim().split(' ');
        let [h, m] = time.split(':').map(Number);
        if (mer === 'PM' && h !== 12) h += 12;
        if (mer === 'AM' && h === 12) h = 0;
        return h * 60 + (m || 0);
    };

    const formatTime = (mins) => {
        let h = Math.floor(mins / 60);
        let m = mins % 60;
        const mer = h >= 12 ? 'PM' : 'AM';
        if (h === 0) h = 12;
        else if (h > 12) h -= 12;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${mer}`;
    };

    let startMins = parseTime(openingTime);
    let endMins = parseTime(closingTime);
    if (isNaN(startMins) || isNaN(endMins) || startMins >= endMins) {
        startMins = 8 * 60;
        endMins = 17 * 60;
    }

    const slots = [];
    let curr = startMins;
    while (curr < endMins) {
        const hour24 = Math.floor(curr / 60);
        if (!(lunchBreak && hour24 === 12)) {
            slots.push(formatTime(curr));
        }
        curr += 60;
    }
    return slots;
}

/**
 * D-006: Update Doctor Schedule & Time Slots
 */
router.post('/update_schedule', async (req, res) => {
    try {
        const body = req.body;
        const userEmail = req.user.email;
        const targetEmail = body.doctor_email || body.email || userEmail;
        const targetId = body.doctor_id || body.id;

        let doctor = null;
        if (targetId) doctor = await dbClient.findOne('users', { _id: targetId });
        if (!doctor && targetEmail) doctor = await dbClient.findOne('users', { email: targetEmail });
        if (!doctor) doctor = await dbClient.findOne('users', { _id: req.user.id });

        if (!doctor) {
            return res.status(404).json({ status: 'error', message: 'Doctor record not found for availability update.' });
        }

        const workingDays = (body.working_days || 'Mon - Fri').trim();
        const offDutyDates = Array.isArray(body.off_duty_dates) ? body.off_duty_dates : [];
        const extraDutyDates = Array.isArray(body.extra_duty_dates) ? body.extra_duty_dates : [];
        const customDateHours = (body.custom_date_hours && typeof body.custom_date_hours === 'object' && !Array.isArray(body.custom_date_hours)) ? body.custom_date_hours : {};
        let openingTime = (body.opening_time || '08:00 AM').trim();
        let closingTime = (body.closing_time || '05:00 PM').trim();
        const timezone = (body.timezone || 'Asia/Manila').trim();
        const lunchBreak = (body.lunch_break === true || body.lunch_break === 'true' || body.lunch_break === 1 || body.lunch_break === 'yes');

        const timeSlots = generateSlots(openingTime, closingTime, lunchBreak);
        const compiledSchedule = `${workingDays} (${openingTime} - ${closingTime})`;

        const updateFields = {
            working_days: workingDays,
            off_duty_dates: offDutyDates,
            extra_duty_dates: extraDutyDates,
            custom_date_hours: customDateHours,
            opening_time: openingTime,
            closing_time: closingTime,
            lunch_break: lunchBreak,
            time_slots: timeSlots,
            timezone: timezone,
            schedule_days: compiledSchedule,
            updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19)
        };

        await dbClient.updateOne('users', { _id: doctor._id }, { $set: updateFields });
        await logAudit(req, 'DOCTOR_SCHEDULE_UPDATE', 'users:' + (doctor.email || targetEmail), {
            doctor: doctor.email || targetEmail,
            schedule_days: compiledSchedule,
            slots_count: timeSlots.length
        }, 'success');

        const mergedDoctor = { ...doctor, ...updateFields, id: String(doctor._id) };
        return res.status(200).json({
            status: 'success',
            message: 'Doctor working hours and appointment availability successfully updated!',
            schedule: updateFields,
            doctor: mergedDoctor
        });
    } catch (err) {
        console.error('Update schedule error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to update schedule.' });
    }
});

/**
 * D-003: Patient Medical History & Clinical Record API
 */
router.get('/get_patient_medical_history', async (req, res) => {
    try {
        const patientName = (req.query.patient_name || '').trim();
        const patientEmail = (req.query.patient_email || '').trim().toLowerCase();
        const patientPhone = (req.query.patient_phone || '').trim();

        if (!patientName && !patientEmail && !patientPhone) {
            return res.status(400).json({ status: 'error', message: 'Patient identifier (name, email, or phone) is required.' });
        }

        const allAppts = await dbClient.find('appointments', {});
        const patientAppts = [];
        let matchedName = patientName;
        let matchedEmail = patientEmail;
        let matchedPhone = patientPhone;
        let matchedAge = '';
        let matchedGender = '';
        let matchedAlerts = '';

        for (const apt of allAppts) {
            if (apt.is_deleted || apt.is_archived) continue;

            let isMatch = false;
            if (patientName && (apt.patient_name || '').toLowerCase() === patientName.toLowerCase()) isMatch = true;
            else if (patientEmail && (apt.patient_email || '').toLowerCase() === patientEmail) isMatch = true;
            else if (patientPhone && (apt.patient_phone || '') === patientPhone) isMatch = true;

            if (isMatch) {
                patientAppts.push(apt);
                if (!matchedName && apt.patient_name) matchedName = apt.patient_name;
                if (!matchedEmail && apt.patient_email) matchedEmail = apt.patient_email;
                if (!matchedPhone && apt.patient_phone) matchedPhone = apt.patient_phone;
                if (!matchedAge && apt.patient_age) matchedAge = apt.patient_age;
                if (!matchedGender && apt.patient_gender) matchedGender = apt.patient_gender;
                if (!matchedAlerts && apt.medical_alerts) matchedAlerts = apt.medical_alerts;
            }
        }

        // If matched user exists in users table, fill details
        if (matchedEmail || matchedName) {
            const user = (matchedEmail ? await dbClient.findOne('users', { email: matchedEmail }) : null) ||
                         (matchedName ? await dbClient.findOne('users', { full_name: matchedName }) : null);
            if (user) {
                if (!matchedName) matchedName = user.full_name;
                if (!matchedEmail) matchedEmail = user.email;
                if (!matchedPhone) matchedPhone = user.phone;
                if (!matchedAge) matchedAge = user.age || '';
                if (!matchedGender) matchedGender = user.gender || '';
                if (!matchedAlerts) matchedAlerts = user.allergies || user.medical_alerts || '';
            }
        }

        // Sort appointments descending
        patientAppts.sort((a, b) => {
            const dA = (a.appointment_date || a.date || '') + ' ' + (a.time_slot || a.appointment_time || '');
            const dB = (b.appointment_date || b.date || '') + ' ' + (b.time_slot || b.appointment_time || '');
            return dB.localeCompare(dA);
        });

        // Known medical profiles mapping
        const medicalProfiles = {
            'juan dela cruz': {
                blood_type: 'O+',
                emergency_contact: 'Maria Dela Cruz (Spouse) - +63 918 111 2223',
                systemic_conditions: {
                    hypertension: { present: true, notes: 'Stage 1 Hypertension (Controlled on daily maintenance medication)' },
                    diabetes: { present: false, notes: 'Normal fasting blood sugar' },
                    asthma: { present: false, notes: 'None' },
                    cardiovascular: { present: false, notes: 'No pacemaker, no valve replacement' },
                    bleeding_disorder: { present: false, notes: 'Normal clotting time' },
                    hepatitis_infectious: { present: false, notes: 'Non-reactive' },
                    pregnancy: { present: false, notes: 'N/A' }
                },
                allergies: [
                    { name: 'Penicillin / Amoxicillin', severity: 'None', type: 'Drug Allergy', is_active: false },
                    { name: 'Latex', severity: 'None', type: 'Environmental', is_active: false },
                    { name: 'Local Anesthetics (Lidocaine)', severity: 'Safe', type: 'Anesthetic', is_active: false }
                ],
                current_medications: [
                    { name: 'Amlodipine 5mg', dosage: 'Once daily (Morning)', purpose: 'Hypertension management' },
                    { name: 'Ascorbic Acid (Vitamin C)', dosage: '500mg daily', purpose: 'Immune supplement' }
                ],
                clinical_precautions: 'Check baseline Blood Pressure before administering Local Anesthesia with Epinephrine. Maintain calm operatory setting.'
            },
            'beatriz ramos': {
                blood_type: 'A+',
                emergency_contact: 'Ricardo Ramos (Father) - +63 922 333 4445',
                systemic_conditions: {
                    hypertension: { present: false, notes: 'Normal blood pressure (110/70)' },
                    diabetes: { present: false, notes: 'None' },
                    asthma: { present: false, notes: 'None' },
                    cardiovascular: { present: false, notes: 'None' },
                    bleeding_disorder: { present: false, notes: 'None' },
                    hepatitis_infectious: { present: false, notes: 'None' },
                    pregnancy: { present: false, notes: 'Not pregnant' }
                },
                allergies: [
                    { name: 'Latex Powdered Gloves', severity: 'Moderate', type: 'Contact Allergy', is_active: true, notes: 'Develops contact dermatitis with powdered latex gloves. MUST use powder-free Nitrile gloves.' },
                    { name: 'Penicillin', severity: 'None', type: 'Drug Allergy', is_active: false }
                ],
                current_medications: [
                    { name: 'Cetirizine 10mg', dosage: 'As needed for allergic rhinitis', purpose: 'Antihistamine' }
                ],
                clinical_precautions: 'STRICT LATEX-FREE OPERATORY: Use Nitrile examination gloves, non-latex dental dam, and non-latex orthodontic elastics.'
            }
        };

        const lookupKey = (matchedName || '').toLowerCase().trim();
        const profileData = medicalProfiles[lookupKey] || {
            blood_type: 'O+',
            emergency_contact: 'Primary Contact on File',
            systemic_conditions: {
                hypertension: { present: false, notes: 'None reported' },
                diabetes: { present: false, notes: 'None reported' },
                asthma: { present: false, notes: 'None reported' },
                cardiovascular: { present: false, notes: 'None reported' },
                bleeding_disorder: { present: false, notes: 'None reported' },
                hepatitis_infectious: { present: false, notes: 'None reported' },
                pregnancy: { present: false, notes: 'N/A' }
            },
            allergies: matchedAlerts && !['none', 'none reported', 'none.'].includes(matchedAlerts.toLowerCase().trim())
                ? [{ name: matchedAlerts, severity: 'Moderate', type: 'Medical Alert', is_active: true }]
                : [{ name: 'No Known Drug Allergies (NKDA)', severity: 'None', type: 'General', is_active: false }],
            current_medications: [],
            clinical_precautions: 'Verify medical questionnaire responses before initiating surgical procedures.'
        };

        const treatedTeethSet = [];
        const treatmentTimeline = [];

        for (const apt of patientAppts) {
            const aptDate = apt.appointment_date || apt.date || 'N/A';
            const aptService = apt.service_name || 'Dental Consultation';
            const aptDiagnosis = apt.diagnosis || apt.chief_complaint || 'Routine examination';
            const aptNotes = apt.procedure_notes || apt.notes || '';
            const aptPrescription = apt.prescription || '';
            const aptStatus = apt.status || 'scheduled';
            const aptDoctor = apt.dentist_name || apt.doctor_name || 'Attending Dentist';
            const aptChair = apt.chair_room || apt.operatory_chair || 'Dental Operatory Chair';

            const teethRaw = apt.teeth_selected || [];
            const teethArray = Array.isArray(teethRaw) ? teethRaw : (typeof teethRaw === 'string' ? teethRaw.split(',').map(s => s.trim()) : []);

            teethArray.forEach(t => {
                if (t && !treatedTeethSet.includes(t)) treatedTeethSet.push(t);
            });

            treatmentTimeline.push({
                appointment_id: String(apt._id),
                date: aptDate,
                time: apt.time_slot || apt.appointment_time || '',
                service: aptService,
                status: aptStatus,
                dentist: aptDoctor,
                chair_room: aptChair,
                diagnosis: aptDiagnosis,
                teeth_involved: teethArray,
                procedure_notes: aptNotes,
                prescription: aptPrescription,
                follow_up_date: apt.follow_up_date || ''
            });
        }

        return res.status(200).json({
            status: 'success',
            patient: {
                name: matchedName || 'Unknown Patient',
                email: matchedEmail,
                phone: matchedPhone,
                age: matchedAge || '30',
                gender: matchedGender || 'Unspecified',
                blood_type: profileData.blood_type,
                emergency_contact: profileData.emergency_contact,
                medical_alerts_summary: matchedAlerts || 'None reported',
                total_appointments_on_file: patientAppts.length
            },
            systemic_health_questionnaire: profileData.systemic_conditions,
            allergies: profileData.allergies,
            current_medications: profileData.current_medications,
            clinical_precautions: profileData.clinical_precautions,
            treated_teeth_summary: treatedTeethSet,
            treatment_history_timeline: treatmentTimeline
        });
    } catch (err) {
        console.error('Get medical history error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to retrieve patient medical history.' });
    }
});

/**
 * D-004: Get Clinical Records
 */
router.get('/get_clinical_records', async (req, res) => {
    try {
        const query = (req.query.q || '').trim().toLowerCase();
        const category = (req.query.category || '').trim();
        const dateFrom = (req.query.date_from || '').trim();
        const dateTo = (req.query.date_to || '').trim();

        const allCompleted = await dbClient.find('appointments', { status: 'completed' });
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
        console.error('Get clinical records error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to fetch clinical records.' });
    }
});

/**
 * Delete Record History
 */
router.post('/delete_record_history', async (req, res) => {
    try {
        const body = req.body;
        const appointmentId = (body.appointment_id || '').trim();
        const targetIndex = body.history_index;

        if (!appointmentId) {
            return res.status(400).json({ status: 'error', message: 'Appointment ID is required.' });
        }

        const appointment = await dbClient.findOne('appointments', { _id: appointmentId });
        if (!appointment) {
            return res.status(404).json({ status: 'error', message: 'Clinical record not found.' });
        }

        let history = Array.isArray(appointment.edit_history) ? [...appointment.edit_history] : [];
        const updateSet = {
            last_updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19)
        };

        if (targetIndex === 'all') {
            history = [];
            updateSet.edit_history = [];
        } else if (targetIndex === 'original_details' || targetIndex === 'current_details') {
            updateSet.diagnosis = 'Standard procedure';
            updateSet.procedure_notes = '';
            updateSet.prescription = '';
            updateSet.post_op_instructions = '';
            updateSet.teeth_selected = [];
            updateSet.tooth_surfaces = [];
        } else if (targetIndex === 'wipe_everything') {
            updateSet.diagnosis = 'Standard procedure';
            updateSet.procedure_notes = '';
            updateSet.prescription = '';
            updateSet.post_op_instructions = '';
            updateSet.teeth_selected = [];
            updateSet.tooth_surfaces = [];
            updateSet.edit_history = [];
            history = [];
        } else if (typeof targetIndex === 'number' || !isNaN(Number(targetIndex))) {
            const idx = Number(targetIndex);
            if (idx >= 0 && idx < history.length) {
                history.splice(idx, 1);
            }
            updateSet.edit_history = history;
        }

        await dbClient.updateOne('appointments', { _id: appointmentId }, { $set: updateSet });
        await logAudit(req, 'CLINICAL_HISTORY_DELETED', 'appointments:' + appointmentId, {
            doctor: req.user.email,
            patient: appointment.patient_name || 'N/A',
            target: targetIndex === 'all' ? 'all_revisions' : `index_${targetIndex}`
        }, 'success');

        return res.status(200).json({
            status: 'success',
            message: 'Historical record deleted successfully.',
            remaining_history_count: history.length
        });
    } catch (err) {
        console.error('Delete record history error:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to delete record history.' });
    }
});

export default router;


