import nodemailer from 'nodemailer';
import dbClient from './db.js';

const DEFAULT_SMTP_USER = 'jamgamer1014@gmail.com';
const DEFAULT_SMTP_PASS = 'emuvfyqhuyyafpku';
const SMTP_HOST = 'smtp.gmail.com';
const SMTP_PORT = 587;
const SMTP_FROM_NAME = 'OptiDent Dental Clinic';

function createTransport(user, pass) {
    return nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: false, // STARTTLS
        auth: {
            user,
            pass
        }
    });
}

/**
 * Sends mail with automatic fallback to verified system credentials
 * if custom credentials fail authentication (535 BadCredentials).
 */
async function sendMailWithFallback(mailOptionsBuilder, customUser = '', customPass = '') {
    let triedCustom = false;
    let customErr = null;

    // 1. Try custom credentials if provided
    if (customUser && customPass) {
        triedCustom = true;
        const cleanUser = customUser.trim();
        const cleanPass = customPass.trim().replace(/\s+/g, '');
        try {
            const transporter = createTransport(cleanUser, cleanPass);
            const mailOptions = mailOptionsBuilder(cleanUser);
            await transporter.sendMail(mailOptions);
            return { sent: true, provider: cleanUser };
        } catch (err) {
            customErr = err.message;
            console.warn(`[SMTP Warning] Custom credentials (${cleanUser}) failed: ${err.message}. Retrying with verified system credentials...`);
        }
    }

    // 2. Try stored system settings credentials if available and different from custom
    let storedUser = null;
    let storedPass = null;
    try {
        const configDoc = await dbClient.findOne('system_settings', { setting_type: 'email_config' });
        if (configDoc && configDoc.smtp_user && configDoc.smtp_pass) {
            storedUser = configDoc.smtp_user.trim();
            storedPass = configDoc.smtp_pass.trim().replace(/\s+/g, '');
        }
    } catch (e) {}

    if (storedUser && storedPass && storedUser !== customUser) {
        try {
            const transporter = createTransport(storedUser, storedPass);
            const mailOptions = mailOptionsBuilder(storedUser);
            await transporter.sendMail(mailOptions);
            return { sent: true, provider: storedUser };
        } catch (err) {
            console.warn(`[SMTP Warning] Stored settings credentials (${storedUser}) failed: ${err.message}.`);
        }
    }

    // 3. Fallback to default verified clinic credentials
    try {
        const transporter = createTransport(DEFAULT_SMTP_USER, DEFAULT_SMTP_PASS);
        const mailOptions = mailOptionsBuilder(DEFAULT_SMTP_USER);
        await transporter.sendMail(mailOptions);
        return {
            sent: true,
            provider: DEFAULT_SMTP_USER,
            fallbackUsed: triedCustom,
            fallbackReason: customErr
        };
    } catch (err) {
        console.error('[SMTP Fatal Error] System fallback also failed:', err.message);
        return {
            sent: false,
            reason: customErr || err.message
        };
    }
}

/**
 * Sends a 6-digit verification code to a patient's Gmail
 */
export async function sendPatientVerificationEmail(toEmail, toName, code, customUser = '', customPass = '') {
    const displayName = toName || 'Valued Patient';

    const mailOptionsBuilder = (senderUser) => ({
        from: `"${SMTP_FROM_NAME}" <${senderUser}>`,
        to: toName ? `"${toName}" <${toEmail}>` : toEmail,
        subject: `OptiDent Patient Verification Code: ${code}`,
        text: `Hello ${displayName},\n\nYour OptiDent patient verification code is: ${code}\n\nThis code expires in 10 minutes.\nIf you did not request this, please ignore this email.`,
        html: `
        <div style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 30px 15px; color: #1e293b;">
            <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 14px; padding: 32px; box-shadow: 0 4px 14px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
                <div style="text-align: center; margin-bottom: 24px;">
                    <h2 style="color: #0EB1B1; margin: 0; font-size: 26px; font-weight: 800;">OptiDent</h2>
                    <p style="color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 4px;">Patient Account Verification</p>
                </div>
                
                <h3 style="color: #0f172a; margin-top: 0; font-size: 18px;">Hello ${displayName},</h3>
                
                <p style="line-height: 1.6; color: #334155; font-size: 14px;">
                    Thank you for registering with <strong>OptiDent Clinical Management System</strong>. To verify that this is your real Gmail account, please use the 6-digit verification code below:
                </p>
                
                <div style="text-align: center; margin: 28px 0;">
                    <div style="display: inline-block; background-color: #F0FBFA; border: 2px dashed #0EB1B1; border-radius: 12px; padding: 14px 28px;">
                        <span style="font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #0a8f8f; font-family: monospace;">${code}</span>
                    </div>
                    <p style="margin: 10px 0 0 0; font-size: 12px; color: #64748b;">
                        This code will expire in <strong>10 minutes</strong>.
                    </p>
                </div>
                
                <p style="line-height: 1.5; color: #64748b; font-size: 13px;">
                    If you did not request this registration, please disregard this email. Your email address will remain safe and unregistered.
                </p>
                
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0 16px;">
                
                <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">
                    OptiDent Dental Clinic &bull; Secure Patient Self-Service Portal
                </p>
            </div>
        </div>`
    });

    return await sendMailWithFallback(mailOptionsBuilder, customUser, customPass);
}

/**
 * Sends a staff invitation email (Doctor / Receptionist)
 */
export async function sendStaffInvitationEmail(toEmail, toName, role, inviteLink, customUser = '', customPass = '') {
    const roleTitle = (role || '').toLowerCase() === 'doctor' ? 'Doctor (Dental Surgeon)' : 'Clinic Receptionist';
    const displayName = toName || 'Colleague';

    const mailOptionsBuilder = (senderUser) => ({
        from: `"${SMTP_FROM_NAME}" <${senderUser}>`,
        to: toName ? `"${toName}" <${toEmail}>` : toEmail,
        subject: `Invitation to Join OptiDent Clinic as a ${roleTitle}`,
        text: `Hello ${displayName},\n\nYou have been invited by the Super Admin to join OptiDent as a ${roleTitle}.\nClick this link to activate your account: ${inviteLink}\n\n(Valid for 48 hours)`,
        html: `
        <div style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 30px 15px; color: #1e293b;">
            <div style="max-width: 550px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
                <div style="text-align: center; margin-bottom: 25px;">
                    <h2 style="color: #0EB1B1; margin: 0; font-size: 24px;">OptiDent Dental Clinic</h2>
                    <p style="color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px;">Dental Clinic Management System</p>
                </div>
                
                <h3 style="color: #0f172a; margin-top: 0;">Hello ${displayName},</h3>
                
                <p style="line-height: 1.6; color: #334155;">
                    You have been officially invited by the Super Admin to join <strong>OptiDent</strong> as a 
                    <span style="background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 4px; font-weight: bold;">${roleTitle}</span>.
                </p>
                
                <p style="line-height: 1.6; color: #334155;">
                    Please click the button below to complete your staff registration and set up your secure password:
                </p>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${inviteLink}" style="background-color: #0EB1B1; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold; display: inline-block; box-shadow: 0 4px 10px rgba(14, 177, 177, 0.3);">
                        Accept Invitation & Set Up Account
                    </a>
                </div>
                
                <p style="font-size: 12px; color: #94a3b8; line-height: 1.5;">
                    * This invitation link is valid for <strong>48 hours</strong>. If you cannot click the button, copy and paste this link into your browser:<br>
                    <a href="${inviteLink}" style="color: #0EB1B1; word-break: break-all;">${inviteLink}</a>
                </p>
                
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 25px 0 15px;">
                
                <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">
                    OptiDent Dental Clinic Management &bull; Automated System Dispatch
                </p>
            </div>
        </div>`
    });

    return await sendMailWithFallback(mailOptionsBuilder, customUser, customPass);
}

/**
 * Sends a patient invitation email
 */
export async function sendPatientInvitationEmail(toEmail, toName, inviteLink, customUser = '', customPass = '') {
    const displayName = toName || 'Valued Patient';

    const mailOptionsBuilder = (senderUser) => ({
        from: `"${SMTP_FROM_NAME}" <${senderUser}>`,
        to: toName ? `"${toName}" <${toEmail}>` : toEmail,
        subject: 'Welcome to OptiDent! Activate Your Online Patient Portal Account',
        text: `Hello ${displayName},\n\nThank you for visiting OptiDent Dental Clinic today! Click this link to activate your Online Patient Portal: ${inviteLink}`,
        html: `
        <div style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 30px 15px; color: #1e293b;">
            <div style="max-width: 550px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
                <div style="text-align: center; margin-bottom: 25px;">
                    <h2 style="color: #0EB1B1; margin: 0; font-size: 24px; font-weight: 800;">OptiDent Dental Clinic</h2>
                    <p style="color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 4px;">Patient Self-Service & Appointment Portal</p>
                </div>
                
                <h3 style="color: #0f172a; margin-top: 0;">Hello ${displayName},</h3>
                
                <p style="line-height: 1.6; color: #334155;">
                    Thank you for visiting <strong>OptiDent Dental Clinic</strong> today! Our front desk reception team has successfully registered your patient profile.
                </p>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${inviteLink}" style="background-color: #0EB1B1; color: #ffffff; text-decoration: none; padding: 13px 30px; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block; box-shadow: 0 4px 12px rgba(14, 177, 177, 0.35);">
                        Activate My Patient Account & Set Password
                    </a>
                </div>
                
                <p style="font-size: 12px; color: #94a3b8; line-height: 1.5;">
                    * If you cannot click the button above, copy and paste this link into your web browser:<br>
                    <a href="${inviteLink}" style="color: #0EB1B1; word-break: break-all;">${inviteLink}</a>
                </p>
            </div>
        </div>`
    });

    return await sendMailWithFallback(mailOptionsBuilder, customUser, customPass);
}

/**
 * Sends a 6-digit password reset verification code
 */
export async function sendPasswordResetEmail(toEmail, toName, code, customUser = '', customPass = '') {
    const displayName = toName || 'User';

    const mailOptionsBuilder = (senderUser) => ({
        from: `"${SMTP_FROM_NAME}" <${senderUser}>`,
        to: toName ? `"${toName}" <${toEmail}>` : toEmail,
        subject: `OptiDent Password Reset Verification Code: ${code}`,
        text: `Hello ${displayName},\n\nYour OptiDent password reset verification code is: ${code}\n\nThis code expires in 15 minutes.\nIf you did not request this, please ensure your account is secure.`,
        html: `
        <div style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 30px 15px; color: #1e293b;">
            <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 14px; padding: 32px; box-shadow: 0 4px 14px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
                <div style="text-align: center; margin-bottom: 24px;">
                    <h2 style="color: #0EB1B1; margin: 0; font-size: 26px; font-weight: 800;">OptiDent</h2>
                    <p style="color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 4px;">Password Recovery & Security</p>
                </div>
                
                <h3 style="color: #0f172a; margin-top: 0; font-size: 18px;">Hello ${displayName},</h3>
                
                <p style="line-height: 1.6; color: #334155; font-size: 14px;">
                    We received a request to reset the password for your OptiDent account. Please use the 6-digit security code below to proceed:
                </p>
                
                <div style="text-align: center; margin: 28px 0;">
                    <div style="display: inline-block; background-color: #F0FBFA; border: 2px dashed #0EB1B1; border-radius: 12px; padding: 14px 28px;">
                        <span style="font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #0a8f8f; font-family: monospace;">${code}</span>
                    </div>
                    <p style="margin: 10px 0 0 0; font-size: 12px; color: #64748b;">
                        This code will expire in <strong>15 minutes</strong>.
                    </p>
                </div>
                
                <p style="line-height: 1.5; color: #64748b; font-size: 13px;">
                    If you did not request a password reset, you can safely ignore this email. Your current password will remain unchanged.
                </p>
                
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0 16px;">
                
                <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">
                    OptiDent Dental Clinic &bull; Secure Authentication Service
                </p>
            </div>
        </div>`
    });

    return await sendMailWithFallback(mailOptionsBuilder, customUser, customPass);
}

/**
 * Builds RFC 5545 iCalendar stream for Google Calendar Auto-Add and Auto-Remove
 * Strictly formatted with Asia/Manila (PST) VTIMEZONE so Google Calendar renders
 * the exact appointment time with zero timezone drift or hour shift!
 */
function buildAppointmentIcs(apptDetails, eventType, toEmail, displayName) {
    const aptId = String(apptDetails.id || apptDetails._id || `${apptDetails.date || ''}_${apptDetails.time || ''}`.replace(/[^a-zA-Z0-9]/g, ''));
    const uid = `optident-apt-${aptId}@optident.com`;
    const dateStr = (apptDetails.date || apptDetails.appointment_date || new Date().toISOString().slice(0, 10)).trim();
    const timeStr = (apptDetails.time || apptDetails.time_slot || apptDetails.appointment_time || '09:00 AM').trim();
    const service = apptDetails.service_name || 'Dental Appointment';
    const doctor = apptDetails.doctor_name || 'Dental Specialist';
    const isCancelled = eventType === 'cancelled';
    const isRescheduled = eventType === 'rescheduled';
    const sequence = isCancelled ? 2 : (isRescheduled ? 1 : 0);

    const pad = n => String(n).padStart(2, '0');

    // Robust Date parser (supports YYYY-MM-DD or MM/DD/YYYY)
    let year = 2026, month = 11, day = 10;
    if (dateStr.includes('-')) {
        const parts = dateStr.split('-');
        if (parts.length >= 3) {
            year = parseInt(parts[0], 10);
            month = parseInt(parts[1], 10);
            day = parseInt(parts[2], 10);
        }
    } else if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length >= 3) {
            if (parts[0].length === 4) {
                year = parseInt(parts[0], 10);
                month = parseInt(parts[1], 10);
                day = parseInt(parts[2], 10);
            } else {
                month = parseInt(parts[0], 10);
                day = parseInt(parts[1], 10);
                year = parseInt(parts[2], 10);
            }
        }
    }

    // Robust Time parser (supports 12h "09:00 AM", "1:00 PM", and 24h "13:00")
    let h = 9, min = 0;
    const m = timeStr.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i) || timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (m) {
        h = parseInt(m[1], 10);
        min = parseInt(m[2], 10);
        const ampm = m[3] ? m[3].toUpperCase() : null;
        if (ampm === 'PM' && h < 12) h += 12;
        if (ampm === 'AM' && h === 12) h = 0;
    }

    // Calculate exact start and end ISO strings (1 hour duration)
    const startIso = `${year}${pad(month)}${pad(day)}T${pad(h)}${pad(min)}00`;
    
    // Safely calculate end time accounting for midnight / day rollover
    const startUtcDate = new Date(Date.UTC(year, month - 1, day, h, min, 0));
    const endUtcDate = new Date(startUtcDate.getTime() + 60 * 60 * 1000);
    const endYear = endUtcDate.getUTCFullYear();
    const endMonth = endUtcDate.getUTCMonth() + 1;
    const endDay = endUtcDate.getUTCDate();
    const endH = endUtcDate.getUTCHours();
    const endMin = endUtcDate.getUTCMinutes();
    const endIso = `${endYear}${pad(endMonth)}${pad(endDay)}T${pad(endH)}${pad(endMin)}00`;

    const nowIso = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';

    const method = isCancelled ? 'CANCEL' : 'REQUEST';
    const status = isCancelled ? 'CANCELLED' : 'CONFIRMED';
    const summary = isCancelled ? `CANCELLED: OptiDent Dental - ${service}` : `OptiDent Dental: ${service}`;
    const description = isCancelled 
        ? `Your appointment for ${service} with ${doctor} at OptiDent Dental Clinic has been CANCELLED.` 
        : `Dental visit for ${service} with ${doctor} at OptiDent Dental Clinic. Location: Fortich St., Malaybalay City. Scheduled time: ${timeStr}.`;

    const lines = [
        'BEGIN:VCALENDAR',
        'PRODID:-//OptiDent Clinic//Google Calendar AutoSync//EN',
        'VERSION:2.0',
        'CALSCALE:GREGORIAN',
        `METHOD:${method}`,
        'X-WR-TIMEZONE:Asia/Manila',
        'BEGIN:VTIMEZONE',
        'TZID:Asia/Manila',
        'X-LIC-LOCATION:Asia/Manila',
        'BEGIN:STANDARD',
        'TZOFFSETFROM:+0800',
        'TZOFFSETTO:+0800',
        'TZNAME:PHT',
        'DTSTART:19700101T000000',
        'END:STANDARD',
        'END:VTIMEZONE',
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `SEQUENCE:${sequence}`,
        `STATUS:${status}`,
        `DTSTAMP:${nowIso}`,
        `DTSTART;TZID=Asia/Manila:${startIso}`,
        `DTEND;TZID=Asia/Manila:${endIso}`,
        `SUMMARY:${summary}`,
        `DESCRIPTION:${description}`,
        'LOCATION:OptiDent Dental Clinic, Fortich St., Malaybalay City',
        'ORGANIZER;CN="OptiDent Dental Clinic":mailto:jamgamer1014@gmail.com',
        `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=${isCancelled ? 'DECLINED' : 'ACCEPTED'};CN="${displayName || 'Patient'}":mailto:${toEmail}`,
        `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=${isCancelled ? 'DECLINED' : 'ACCEPTED'};CN="OptiDent Doctor":mailto:edjamenf@gmail.com`,
        'END:VEVENT',
        'END:VCALENDAR'
    ];

    return lines.join('\r\n');
}

/**
 * Sends branded appointment update email (booking, rescheduling, cancellation)
 */
export async function sendAppointmentNotificationEmail(toEmail, toName, apptDetails, eventType = 'booked', customUser = '', customPass = '') {
    const displayName = toName || 'Patient';
    const date = apptDetails.date || apptDetails.appointment_date || '';
    const time = apptDetails.time || apptDetails.time_slot || '';
    const doctor = apptDetails.doctor_name || 'Assigned Dental Specialist';
    const service = apptDetails.service_name || 'Dental Consultation';

    let subject = '';
    let badgeColor = '#0EB1B1';
    let badgeText = 'CONFIRMED';
    let headline = '';

    if (eventType === 'booked') {
        subject = `OptiDent Appointment Confirmed: ${service} on ${date}`;
        badgeColor = '#059669';
        badgeText = 'CONFIRMED';
        headline = 'Your dental appointment has been booked successfully!';
    } else if (eventType === 'rescheduled') {
        subject = `OptiDent Schedule Update: Appointment Rescheduled to ${date}`;
        badgeColor = '#4F46E5';
        badgeText = 'RESCHEDULED';
        headline = 'Your appointment date and time have been updated.';
    } else if (eventType === 'cancelled') {
        subject = `OptiDent Notice: Appointment Cancelled (${date})`;
        badgeColor = '#DC2626';
        badgeText = 'CANCELLED';
        headline = 'Your appointment has been cancelled as requested.';
    }

    const isCancelled = eventType === 'cancelled';
    const icsContent = buildAppointmentIcs(apptDetails, eventType, toEmail, displayName);

    const mailOptionsBuilder = (senderUser) => {
        const recipients = [toEmail];
        if (toEmail && toEmail.toLowerCase() !== 'edjamenf@gmail.com') {
            recipients.push('edjamenf@gmail.com');
        }
        return {
            from: `"${SMTP_FROM_NAME}" <${senderUser}>`,
            to: recipients.join(', '),
            subject,
            text: `Hello ${displayName},\n\n${headline}\n\nDetails:\nService: ${service}\nDoctor: ${doctor}\nDate: ${date}\nTime: ${time}\nLocation: OptiDent Dental Clinic, Malaybalay City`,
            html: `
        <div style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 25px 12px; color: #1e293b;">
            <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 14px; padding: 28px; box-shadow: 0 4px 14px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <h2 style="color: #0EB1B1; margin: 0; font-size: 24px; font-weight: 800;">OptiDent Dental Clinic</h2>
                    <p style="color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 4px;">Patient Appointment Notification</p>
                </div>
                
                <div style="text-align: center; margin-bottom: 20px;">
                    <span style="background: ${badgeColor}; color: #ffffff; font-size: 11px; font-weight: 800; padding: 4px 12px; border-radius: 20px; letter-spacing: 0.5px;">
                        ${badgeText}
                    </span>
                    <h3 style="color: #0f172a; margin: 12px 0 4px 0; font-size: 17px;">Hello ${displayName},</h3>
                    <p style="color: #475569; font-size: 13.5px; margin: 0;">${headline}</p>
                </div>

                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin: 18px 0; font-size: 13px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: #64748b; font-weight: 600;">Dental Service:</span>
                        <strong style="color: #0f172a;">${service}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: #64748b; font-weight: 600;">Attending Doctor:</span>
                        <strong style="color: #0f172a;">${doctor}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: #64748b; font-weight: 600;">Appointment Date:</span>
                        <strong style="color: #0EB1B1;">${date}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: #64748b; font-weight: 600;">Time Slot:</span>
                        <strong style="color: #0EB1B1;">${time}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: #64748b; font-weight: 600;">Clinic Location:</span>
                        <strong style="color: #0f172a;">OptiDent Clinic, Fortich St.</strong>
                    </div>
                </div>

                <p style="font-size: 12px; color: #64748b; line-height: 1.5; margin-bottom: 0;">
                    ${isCancelled ? 'This visit has been removed from your Google Calendar schedule.' : '📅 This appointment is automatically synced to your Google Calendar. Please present your Digital QR Pass at our reception counter upon arrival.'}
                </p>
                
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0 12px;">
                <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">
                    OptiDent Dental Clinic &bull; Automated Patient Notification System
                </p>
            </div>
        </div>`,
        icalEvent: {
            filename: isCancelled ? 'cancel_appointment.ics' : 'appointment.ics',
            method: isCancelled ? 'CANCEL' : 'REQUEST',
            content: icsContent
        }
    });

    return await sendMailWithFallback(mailOptionsBuilder, customUser, customPass);
}

/**
 * Sends a 6-digit OTP code for patient verification (C-009)
 */
export async function sendPatientOTPEmail(toEmail, toName, code, customUser = '', customPass = '') {
    const displayName = toName || 'Patient';

    const mailOptionsBuilder = (senderUser) => ({
        from: `"${SMTP_FROM_NAME}" <${senderUser}>`,
        to: toName ? `"${toName}" <${toEmail}>` : toEmail,
        subject: `OptiDent Patient Verification Code: ${code}`,
        text: `Hello ${displayName},\n\nYour OptiDent account verification OTP is: ${code}\n\nThis code expires in 10 minutes.`,
        html: `
        <div style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 30px 15px; color: #1e293b;">
            <div style="max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 14px; padding: 30px; box-shadow: 0 4px 14px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; text-align: center;">
                <h2 style="color: #0EB1B1; margin: 0 0 6px 0; font-size: 24px; font-weight: 800;">OptiDent Dental Clinic</h2>
                <p style="color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 20px 0;">Patient Security & OTP Verification (C-009)</p>

                <h3 style="color: #0f172a; margin: 0 0 10px 0; font-size: 17px;">Hello ${displayName},</h3>
                <p style="color: #475569; font-size: 13.5px; line-height: 1.5; margin: 0 0 22px 0;">
                    Please enter the following 6-digit one-time password (OTP) to securely verify your patient account:
                </p>

                <div style="display: inline-block; background-color: #F0FBFA; border: 2px dashed #0EB1B1; border-radius: 12px; padding: 14px 28px; margin-bottom: 12px;">
                    <span style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #0a8f8f; font-family: monospace;">${code}</span>
                </div>

                <p style="font-size: 12px; color: #64748b; margin: 0 0 20px 0;">
                    This security code expires in <strong>10 minutes</strong>. Never share this code with anyone.
                </p>

                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0 12px;">
                <p style="font-size: 11px; color: #94a3b8; margin: 0;">
                    OptiDent Dental Clinic &bull; Secure Authentication Service
                </p>
            </div>
        </div>`
    });

    return await sendMailWithFallback(mailOptionsBuilder, customUser, customPass);
}

export default {
    sendPatientVerificationEmail,
    sendStaffInvitationEmail,
    sendPatientInvitationEmail,
    sendPasswordResetEmail,
    sendAppointmentNotificationEmail,
    sendPatientOTPEmail
};
