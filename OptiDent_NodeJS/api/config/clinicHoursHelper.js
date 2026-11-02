/**
 * OptiDent System - Clinic Operating Hours & Time Slots Helper (Node.js ES Module)
 * Provides system-wide master time slot calculation based on admin and doctor settings
 */

export class ClinicHoursHelper {
    /**
     * Generates an array of active time slot strings (e.g. ['08:00 AM', '09:00 AM', ...])
     */
    static generateSlots(openingTime = '08:00 AM', closingTime = '05:00 PM', lunchBreak = true) {
        const parseTime = (tStr) => {
            const m = (tStr || '').match(/(\d+):(\d+)\s*(AM|PM)/i);
            if (!m) return null;
            let h = parseInt(m[1], 10);
            const min = parseInt(m[2], 10);
            const isPM = m[3].toUpperCase() === 'PM';
            if (isPM && h !== 12) h += 12;
            if (!isPM && h === 12) h = 0;
            return h * 60 + min;
        };

        const formatTime = (minutes) => {
            let h = Math.floor(minutes / 60);
            const min = minutes % 60;
            const ampm = h >= 12 ? 'PM' : 'AM';
            h = h % 12;
            if (h === 0) h = 12;
            return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')} ${ampm}`;
        };

        let startMin = parseTime(openingTime) ?? (8 * 60);
        let endMin = parseTime(closingTime) ?? (17 * 60);
        if (startMin >= endMin) {
            startMin = 8 * 60;
            endMin = 17 * 60;
        }

        const slots = [];
        let curr = startMin;
        while (curr < endMin) {
            const hour24 = Math.floor(curr / 60);
            if (!(lunchBreak && hour24 === 12)) {
                slots.push(formatTime(curr));
            }
            curr += 60;
        }
        return slots;
    }

    /**
     * Resolves and standardizes a doctor's schedule, ensuring working days, hours, and slots are 100% in sync
     */
    static resolveDoctorSchedule(userDoc = {}) {
        let workingDays = userDoc.working_days || '';
        let openingTime = userDoc.opening_time || '';
        let closingTime = userDoc.closing_time || '';
        const scheduleDays = userDoc.schedule_days || '';

        if (scheduleDays) {
            const m1 = scheduleDays.match(/^(.*?)\s*[\(,]\s*(.*?)\s*-\s*(.*?)\s*[\)]?$/i) ||
                       scheduleDays.match(/^(.*?)\s*\(\s*(.*?)\s*-\s*(.*?)\s*\)$/i);
            if (m1) {
                const parsedDays = m1[1].trim();
                if (!workingDays && parsedDays) workingDays = parsedDays;
                if (!openingTime && m1[2]) openingTime = m1[2].trim();
                if (!closingTime && m1[3]) closingTime = m1[3].trim();
            } else {
                const m2 = scheduleDays.match(/^(.*?)\s*-\s*(.*?)$/i);
                if (m2 && (!openingTime || !closingTime)) {
                    if (!openingTime) openingTime = m2[1].trim();
                    if (!closingTime) closingTime = m2[2].trim();
                }
            }
        }

        if (!workingDays) workingDays = 'Mon - Fri';
        if (!openingTime) openingTime = '08:00 AM';
        if (!closingTime) closingTime = '05:00 PM';

        const normalizeTime = (tStr, fallback) => {
            const m = (tStr || '').match(/(\d+):(\d+)\s*(AM|PM)/i);
            if (!m) return fallback;
            const h = parseInt(m[1], 10);
            const min = parseInt(m[2], 10);
            const ampm = m[3].toUpperCase();
            return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')} ${ampm}`;
        };

        openingTime = normalizeTime(openingTime, '08:00 AM');
        closingTime = normalizeTime(closingTime, '05:00 PM');

        let lunchBreak = true;
        if (userDoc.lunch_break !== undefined) {
            const lb = userDoc.lunch_break;
            lunchBreak = (lb === true || lb === 'yes' || lb === 'true' || lb === 1 || lb === '1');
        }

        const compiledSchedule = `${workingDays} (${openingTime} - ${closingTime})`;

        const timeSlots = (Array.isArray(userDoc.time_slots) && userDoc.time_slots.length > 0 && userDoc.opening_time === openingTime && userDoc.closing_time === closingTime)
            ? userDoc.time_slots
            : this.generateSlots(openingTime, closingTime, lunchBreak);

        return {
            working_days: workingDays,
            opening_time: openingTime,
            closing_time: closingTime,
            lunch_break: lunchBreak,
            schedule_days: compiledSchedule,
            time_slots: timeSlots,
            timezone: userDoc.timezone || 'Asia/Manila'
        };
    }
}

export default ClinicHoursHelper;

