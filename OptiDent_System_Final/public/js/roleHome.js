/**
 * Role home tab — minimal overview shared by the doctor and receptionist dashboards.
 * RoleHome.render(el, {
 *   name, nextLabel, nextEmpty, attention: [{ label, value, action }], listTitle, listEmpty,
 *   listAction: { label, action }, appointments: [...today's appointments...],
 *   traffic: { endpoint, title }
 * })
 * `action` is a function. The skeleton (and the traffic chart) is built once; later calls only update content.
 */
(function () {
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const IN_CLINIC = ['checked_in', 'waiting', 'in_progress', 'in_treatment', 'in_chair', 'ongoing', 'arrived'];
    const CANCELLED = ['cancelled', 'canceled', 'no_show', 'rejected'];
    const NOW = ['in_progress', 'in_treatment', 'in_chair', 'ongoing'];

    function bucket(status) {
        const s = String(status || '').toLowerCase();
        if (CANCELLED.includes(s)) return 'cancelled';
        if (s === 'completed') return 'completed';
        if (IN_CLINIC.includes(s)) return 'in_clinic';
        return 'scheduled';
    }
    const statusText = s => ({
        checked_in: 'Checked in', waiting: 'Waiting', arrived: 'Arrived', in_progress: 'In chair', in_treatment: 'In chair',
        in_chair: 'In chair', ongoing: 'In chair', completed: 'Completed', cancelled: 'Cancelled', canceled: 'Cancelled', no_show: 'No-show'
    }[String(s || '').toLowerCase()] || 'Scheduled');

    function minutes(t) {
        const m = String(t || '').match(/(\d{1,2}):(\d{2})\s*([AaPp][Mm])?/);
        if (!m) return 24 * 60;
        let h = +m[1] % 12;
        if (m[3] && m[3].toLowerCase() === 'pm') h += 12;
        if (!m[3] && +m[1] === 12) h = 12;
        return h * 60 + +m[2];
    }
    const timeOf = a => a.appointment_time || a.time_slot || '';

    function greeting(name) {
        const h = +new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' }).format(new Date());
        const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
        return name ? `${part}, ${name}` : part;
    }

    function render(el, cfg) {
        if (!el) return;
        if (!el._rh) {
            el.classList.add('rh');
            el.innerHTML = `
                <div class="rh-hello"><h2 data-rh="hello"></h2><p data-rh="date"></p></div>
                <div class="rh-row">
                    <div class="rh-card"><div class="rh-label"><span data-rh="nextLabel"></span></div><div data-rh="next"></div></div>
                    <div class="rh-card"><div class="rh-label"><span>Needs attention</span></div><div class="rh-attn" data-rh="attn"></div></div>
                </div>
                <div data-rh="traffic"></div>
                <div class="rh-card">
                    <div class="rh-label"><span data-rh="listTitle"></span><button type="button" class="rh-link" data-rh="listAction"></button></div>
                    <div class="rh-list" data-rh="list"></div>
                </div>`;
            el._rh = { handlers: {} };
            if (cfg.traffic && window.WeeklyTraffic) WeeklyTraffic.mount(el.querySelector('[data-rh="traffic"]'), cfg.traffic);
            // One delegated listener; actions are swapped on each render
            el.addEventListener('click', e => {
                const b = e.target.closest('[data-act]');
                if (b && el._rh.handlers[b.dataset.act]) el._rh.handlers[b.dataset.act]();
            });
        }
        const q = k => el.querySelector(`[data-rh="${k}"]`);
        const handlers = el._rh.handlers = {};

        q('hello').textContent = greeting(cfg.name);
        q('date').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'Asia/Manila' });

        // Next patient: whoever is in the chair, else the earliest one still to be seen
        const today = (cfg.appointments || []).slice().sort((a, b) => minutes(timeOf(a)) - minutes(timeOf(b)));
        const active = today.filter(a => ['in_clinic', 'scheduled'].includes(bucket(a.status)));
        const next = active.find(a => NOW.includes(String(a.status).toLowerCase())) || active[0];
        q('nextLabel').textContent = cfg.nextLabel || 'Next patient';
        q('next').innerHTML = next ? `
            <div class="rh-next-time">${esc(timeOf(next) || '—')}${NOW.includes(String(next.status).toLowerCase()) ? '<span class="rh-tag now">In chair</span>' : `<span class="rh-tag">${esc(statusText(next.status))}</span>`}</div>
            <div class="rh-next-name">${esc(next.patient_name || 'Patient')}</div>
            <div class="rh-next-detail">${esc([next.service_name, next.doctor_name || next.dentist_name, next.operatory_chair].filter(Boolean).join(' · '))}</div>
            ${next.medical_alerts && !/^none/i.test(next.medical_alerts) ? `<div class="rh-next-note">${esc(next.medical_alerts)}</div>` : ''}`
            : `<div class="rh-empty">${esc(cfg.nextEmpty || 'No more patients today')}</div>`;

        q('attn').innerHTML = (cfg.attention || []).map((a, i) => {
            handlers['attn' + i] = a.action;
            return `<button type="button" class="rh-attn-row" data-act="attn${i}"><span>${esc(a.label)}</span><b>${esc(a.value)}</b></button>`;
        }).join('');

        q('listTitle').textContent = cfg.listTitle || 'Today';
        const act = q('listAction');
        act.textContent = cfg.listAction ? cfg.listAction.label : '';
        act.hidden = !cfg.listAction;
        if (cfg.listAction) { act.dataset.act = 'list'; handlers.list = cfg.listAction.action; }

        q('list').innerHTML = today.length ? today.slice(0, 6).map(a => {
            const b = bucket(a.status);
            return `<div class="rh-item">
                <span class="rh-item-time">${esc(timeOf(a))}</span>
                <span class="rh-item-main"><div class="rh-item-name">${esc(a.patient_name || 'Patient')}</div><div class="rh-item-sub">${esc([a.service_name, a.doctor_name || a.dentist_name].filter(Boolean).join(' · '))}</div></span>
                <span class="rh-status ${b}"><i></i>${esc(statusText(a.status))}</span>
            </div>`;
        }).join('') + (today.length > 6 ? `<div class="rh-item-sub" style="padding-top:8px">+${today.length - 6} more</div>` : '')
            : `<div class="rh-empty">${esc(cfg.listEmpty || 'Nothing scheduled today')}</div>`;
    }

    window.RoleHome = { render };
})();
