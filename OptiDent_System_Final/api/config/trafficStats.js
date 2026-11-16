/**
 * Per-day appointment counts for the dashboard traffic chart.
 * Clinic time (Asia/Manila). Visits = non-cancelled appointments; walk-ins are a subset of visits.
 */
import dbClient from './db.js';

const BUCKETS = {
    completed: ['completed', 'done', 'finished'],
    in_clinic: ['checked_in', 'waiting', 'in_progress', 'in_treatment', 'in_chair', 'ongoing', 'arrived'],
    cancelled: ['cancelled', 'canceled', 'no_show', 'rejected', 'deleted']
};

function bucketOf(status) {
    const s = String(status || '').toLowerCase();
    if (BUCKETS.cancelled.includes(s)) return 'cancelled';
    if (BUCKETS.completed.includes(s)) return 'completed';
    if (BUCKETS.in_clinic.includes(s)) return 'in_clinic';
    return 'scheduled'; // scheduled, pending, confirmed, pending_approval, unknown
}

/**
 * @param {object} opts
 * @param {number} [opts.days=14] 7–31
 * @param {(appt: object) => boolean} [opts.include] extra filter, e.g. one doctor's appointments
 */
export async function dailyTraffic({ days = 14, include = () => true } = {}) {
    const span = Math.min(Math.max(parseInt(days, 10) || 14, 7), 31);
    const dateKey = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(d);
    const now = Date.now();
    const keys = [];
    for (let i = span - 1; i >= 0; i--) keys.push(dateKey(new Date(now - i * 86400000)));

    // '￿' upper bound also catches ISO strings like '2026-11-16T08:00'
    const appts = await dbClient.find('appointments', { appointment_date: { $gte: keys[0], $lte: keys[keys.length - 1] + '￿' } });

    const byDate = Object.fromEntries(keys.map(k => [k, { date: k, completed: 0, in_clinic: 0, scheduled: 0, cancelled: 0, walkin: 0, total: 0 }]));
    for (const a of appts) {
        if (a.is_deleted || a.is_archived || !include(a)) continue;
        const day = byDate[String(a.appointment_date || '').slice(0, 10)];
        if (!day) continue;
        const bucket = bucketOf(a.status);
        day[bucket]++;
        if (bucket !== 'cancelled') {
            day.total++;
            if (a.is_walkin) day.walkin++;
        }
    }

    return {
        status: 'success',
        generated_at: new Date().toISOString(),
        today: keys[keys.length - 1],
        days: keys.map(k => byDate[k])
    };
}
