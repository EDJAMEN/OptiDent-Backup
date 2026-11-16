import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'optidentt@gmail.com';

/**
 * Initializes Google Calendar API client using either:
 * 1. Service Account JSON file (google-service-account.json)
 * 2. Service Account JSON string in .env (GOOGLE_SERVICE_ACCOUNT_KEY)
 * 3. OAuth2 Client with Refresh Token (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN)
 */
function getGoogleCalendarClient() {
    try {
        // Strategy A: Service Account JSON file in OptiDent_NodeJS or root
        const candidateFiles = ['google-service-account.json', 'master-host-514202-g2-5a4a6823ad9c.json'];
        const saPaths = [];
        for (const f of candidateFiles) {
            saPaths.push(
                path.resolve(process.cwd(), f),
                path.resolve(process.cwd(), 'OptiDent_NodeJS', f),
                path.resolve(__dirname, f),
                path.resolve(__dirname, '..', f),
                path.resolve(__dirname, '..', '..', f)
            );
        }
        if (process.env.GOOGLE_SERVICE_ACCOUNT_PATH) {
            saPaths.push(path.resolve(process.env.GOOGLE_SERVICE_ACCOUNT_PATH));
        }

        for (const p of saPaths) {
            if (fs.existsSync(p)) {
                const auth = new google.auth.GoogleAuth({
                    keyFile: p,
                    scopes: ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/calendar.events']
                });
                return google.calendar({ version: 'v3', auth });
            }
        }

        // Strategy B: Service Account JSON string in .env
        if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
            const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
            const auth = new google.auth.GoogleAuth({
                credentials,
                scopes: ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/calendar.events']
            });
            return google.calendar({ version: 'v3', auth });
        }

        // Strategy C: OAuth2 with Refresh Token
        if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN) {
            const oauth2Client = new google.auth.OAuth2(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET,
                'https://developers.google.com/oauthplayground'
            );
            oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
            return google.calendar({ version: 'v3', auth: oauth2Client });
        }

        return null;
    } catch (err) {
        console.warn('[Google Calendar Init Warning]:', err.message);
        return null;
    }
}

/**
 * Automatically creates an event directly in Google Calendar (Zero Clicks / Server-to-Server)
 */
export async function autoCreateGoogleCalendarEvent(apptDetails) {
    const calendar = getGoogleCalendarClient();
    if (!calendar) {
        return {
            success: false,
            configured: false,
            reason: 'Google Calendar API credentials not yet placed in .env or google-service-account.json'
        };
    }

    try {
        const service = apptDetails.service_name || 'Dental Appointment';
        const doctor = apptDetails.doctor_name || 'Assigned Dental Specialist';
        const patientName = apptDetails.patient_name || 'Valued Patient';
        const dateStr = (apptDetails.date || apptDetails.appointment_date || new Date().toISOString().slice(0, 10)).trim();
        const timeStr = (apptDetails.time || apptDetails.time_slot || apptDetails.appointment_time || '09:00 AM').trim();

        // Parse date and Manila time (UTC+8) cleanly
        const cleanDateStr = dateStr.split(' ')[0].split('T')[0];
        let year = 2026, month = 11, day = 10;
        if (cleanDateStr.includes('-')) {
            const parts = cleanDateStr.split('-');
            if (parts.length >= 3) {
                year = parseInt(parts[0], 10);
                month = parseInt(parts[1], 10);
                day = parseInt(parts[2], 10);
            }
        }

        let h = 9, min = 0;
        const m = timeStr.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i) || timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
        if (m) {
            h = parseInt(m[1], 10);
            min = parseInt(m[2], 10);
            const ampm = m[3] ? m[3].toUpperCase() : null;
            if (ampm === 'PM' && h < 12) h += 12;
            if (ampm === 'AM' && h === 12) h = 0;
        }

        const pad = n => String(n).padStart(2, '0');
        const endH = Math.min(h + 1, 23);
        const startDateTime = `${year}-${pad(month)}-${pad(day)}T${pad(h)}:${pad(min)}:00+08:00`;
        const endDateTime = `${year}-${pad(month)}-${pad(day)}T${pad(endH)}:${pad(min)}:00+08:00`;

        const attendees = [
            { email: 'optidentt@gmail.com', displayName: 'OptiDent Super Admin', responseStatus: 'accepted' }
        ];
        if (apptDetails.patient_email && apptDetails.patient_email.includes('@')) {
            attendees.push({ email: apptDetails.patient_email.trim(), displayName: patientName });
        }
        if (apptDetails.doctor_email && apptDetails.doctor_email.includes('@')) {
            attendees.push({ email: apptDetails.doctor_email.trim(), displayName: doctor });
        }

        const event = {
            summary: `OptiDent: ${service} - ${patientName}`,
            description: `Confirmed Dental Appointment with ${doctor} at OptiDent Dental Clinic.\n\n` +
                         `Patient: ${patientName} (${apptDetails.patient_email || 'No email'})\n` +
                         `Doctor: ${doctor}\n` +
                         `Treatment: ${service}\n` +
                         `Time: ${timeStr}\n` +
                         `Operatory Chair: ${apptDetails.operatory_chair || 'Operatory Chair 1'}\n` +
                         `Notes: ${apptDetails.notes || 'None'}\n\n` +
                         `Please arrive 10 minutes prior to scheduled time.`,
            location: 'OptiDent Dental Clinic, Fortich St., Malaybalay City',
            start: {
                dateTime: startDateTime,
                timeZone: 'Asia/Manila'
            },
            end: {
                dateTime: endDateTime,
                timeZone: 'Asia/Manila'
            },
            reminders: {
                useDefault: false,
                overrides: [
                    { method: 'email', minutes: 24 * 60 },
                    { method: 'popup', minutes: 60 }
                ]
            }
        };

        // Dynamically discover shared calendar if available
        let targetCalId = TARGET_CALENDAR_ID;
        try {
            const listRes = await calendar.calendarList.list();
            const items = listRes?.data?.items || [];
            const matched = items.find(c => c.id.toLowerCase() === TARGET_CALENDAR_ID.toLowerCase())
                         || items.find(c => c.accessRole === 'owner' || c.accessRole === 'writer');
            if (matched) {
                targetCalId = matched.id;
            }
        } catch (_) {}

        const res = await calendar.events.insert({
            calendarId: targetCalId,
            requestBody: event
        });

        console.log(`[Google Calendar API] Successfully created event ${res.data.id} on calendar ${targetCalId}`);

        // If an attending doctor has an assigned email different from clinic admin, also sync to doctor's calendar if shared
        if (apptDetails.doctor_email && apptDetails.doctor_email.includes('@') && apptDetails.doctor_email.toLowerCase() !== targetCalId.toLowerCase()) {
            try {
                await calendar.events.insert({
                    calendarId: apptDetails.doctor_email.trim(),
                    requestBody: event
                });
                console.log(`[Google Calendar API] Also synced appointment directly to doctor calendar (${apptDetails.doctor_email})`);
            } catch (docErr) {
                console.log(`[Google Calendar API Notice] Doctor calendar ${apptDetails.doctor_email} not shared with service account (notified via email invite instead).`);
            }
        }

        // If patient email is provided, also sync directly to patient's calendar if shared
        if (apptDetails.patient_email && apptDetails.patient_email.includes('@') && apptDetails.patient_email.toLowerCase() !== targetCalId.toLowerCase()) {
            try {
                await calendar.events.insert({
                    calendarId: apptDetails.patient_email.trim(),
                    requestBody: event
                });
                console.log(`[Google Calendar API] Also synced appointment directly to patient calendar (${apptDetails.patient_email})`);
            } catch (patErr) {
                console.log(`[Google Calendar API Notice] Patient calendar ${apptDetails.patient_email} not shared with service account (notified via email invite instead).`);
            }
        }

        return {
            success: true,
            configured: true,
            eventId: res.data.id,
            htmlLink: res.data.htmlLink
        };
    } catch (err) {
        console.error('[Google Calendar API Error]:', err.message);
        return {
            success: false,
            configured: true,
            error: err.message
        };
    }
}

/**
 * Automatically cancels/deletes an event from Google Calendar
 * Supports direct eventId or appointment search fallback
 */
export async function autoDeleteGoogleCalendarEvent(eventIdOrAppt) {
    if (!eventIdOrAppt) return;
    const calendar = getGoogleCalendarClient();
    if (!calendar) return;

    try {
        let targetCalId = TARGET_CALENDAR_ID;
        try {
            const listRes = await calendar.calendarList.list();
            const items = listRes?.data?.items || [];
            const matched = items.find(c => c.id.toLowerCase() === TARGET_CALENDAR_ID.toLowerCase())
                         || items.find(c => c.accessRole === 'owner' || c.accessRole === 'writer');
            if (matched) {
                targetCalId = matched.id;
            }
        } catch (_) {}

        const eventId = typeof eventIdOrAppt === 'string' ? eventIdOrAppt : (eventIdOrAppt.google_calendar_event_id || '');
        const calsToCheck = [targetCalId];
        if (typeof eventIdOrAppt === 'object') {
            if (eventIdOrAppt.doctor_email && eventIdOrAppt.doctor_email.includes('@') && !calsToCheck.includes(eventIdOrAppt.doctor_email.trim())) {
                calsToCheck.push(eventIdOrAppt.doctor_email.trim());
            }
            if (eventIdOrAppt.patient_email && eventIdOrAppt.patient_email.includes('@') && !calsToCheck.includes(eventIdOrAppt.patient_email.trim())) {
                calsToCheck.push(eventIdOrAppt.patient_email.trim());
            }
        }

        for (const calId of calsToCheck) {
            if (eventId) {
                try {
                    await calendar.events.delete({
                        calendarId: calId,
                        eventId: eventId
                    });
                    console.log(`[Google Calendar API] Deleted event ${eventId} on calendar ${calId}`);
                } catch (_) {}
            }

            // Fallback: search for event by patient name / query if object provided
            if (typeof eventIdOrAppt === 'object') {
                const q = eventIdOrAppt.patient_name || eventIdOrAppt.service_name || '';
                if (q) {
                    try {
                        const searchRes = await calendar.events.list({
                            calendarId: calId,
                            q,
                            maxResults: 10
                        });
                        const items = searchRes?.data?.items || [];
                        const targetDate = eventIdOrAppt.appointment_date || eventIdOrAppt.date || '';
                        for (const item of items) {
                            const itemDate = (item.start?.dateTime || item.start?.date || '').slice(0, 10);
                            if (!targetDate || itemDate === targetDate) {
                                await calendar.events.delete({ calendarId: calId, eventId: item.id }).catch(() => {});
                                console.log(`[Google Calendar API] Deleted matched event ${item.id} (${item.summary}) on calendar ${calId}`);
                            }
                        }
                    } catch (_) {}
                }
            }
        }
    } catch (err) {
        console.warn(`[Google Calendar API Warning] Could not delete event:`, err.message);
    }
}

