/**
 * Weekly Patient Traffic card — shared by the admin, doctor and receptionist dashboards.
 * Usage: WeeklyTraffic.mount(element, { endpoint: 'api/doctor/weekly_traffic.php', title: 'My patient traffic' })
 * The endpoint returns { status, today, days: [{ date, completed, in_clinic, scheduled, cancelled, walkin, total }] }.
 * Refreshes quietly every 30 s while the card is on screen.
 */
(function () {
    const POLL_MS = 30000;
    const SERIES = [
        { key: 'completed', label: 'Completed', color: 'var(--wtc-done)' },
        { key: 'in_clinic', label: 'In clinic', color: 'var(--wtc-clinic)' },
        { key: 'scheduled', label: 'Scheduled', color: 'var(--wtc-sched)' }
    ];
    const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const sum = (arr, k) => arr.reduce((n, d) => n + (d[k] || 0), 0);
    const dayName = (iso, opts) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', opts);
    const niceMax = m => [4, 6, 8, 10, 12, 16, 20, 30, 40, 50, 60, 80, 100, 150, 200, 300, 400, 500].find(x => x >= m) || Math.ceil(m / 100) * 100;

    function mount(el, opts) {
        if (!el) return null;
        if (el._wtc) { el._wtc.refresh(); return el._wtc; }
        const state = { week: null, prev: null, shown: null, max: 4, raf: 0, visible: false, animateNext: true, busy: false };

        el.classList.add('wtc');
        el.innerHTML = `
            <div class="wtc-head">
                <h3 class="wtc-title">${opts.title || 'Weekly patient traffic'}</h3>
                <span class="wtc-range">Last 7 days</span>
            </div>
            <div class="wtc-stats">
                <div class="wtc-stat wtc-stat-main">
                    <span class="wtc-num" data-k="total">–</span>
                    <span class="wtc-label">Visits <span class="wtc-delta" data-k="delta"></span></span>
                </div>
                ${SERIES.map(s => `<div class="wtc-stat"><span class="wtc-num" data-k="${s.key}">–</span><span class="wtc-label"><span class="wtc-dot" style="background:${s.color}"></span>${s.label}</span></div>`).join('')}
                <div class="wtc-stat"><span class="wtc-num" data-k="walkin">–</span><span class="wtc-label"><span class="wtc-dot" style="background:var(--wtc-walk)"></span>Walk-ins</span></div>
            </div>
            <div class="wtc-chart" role="group" aria-label="Visits per day, last 7 days"></div>
            <div class="wtc-foot"></div>`;
        const chart = el.querySelector('.wtc-chart');

        async function refresh() {
            if (state.busy) return;
            state.busy = true;
            try {
                const res = await fetch(opts.endpoint, { cache: 'no-store' });
                const json = await res.json();
                if (!res.ok || json.status !== 'success' || !Array.isArray(json.days)) return;
                const dayChanged = state.week && state.week[6].date !== json.today;
                state.week = json.days.slice(-7);
                state.prev = json.days.slice(-14, -7);
                if (dayChanged) state.animateNext = true;
                renderStats();
                draw();
            } catch (_) { /* keep showing the last good data */ } finally {
                state.busy = false;
            }
        }

        function renderStats() {
            const w = state.week, total = sum(w, 'total'), prevTotal = sum(state.prev, 'total');
            const set = (k, v) => { const n = el.querySelector(`[data-k="${k}"]`); if (n) n.textContent = v; };
            set('total', total);
            SERIES.forEach(s => set(s.key, sum(w, s.key)));
            set('walkin', sum(w, 'walkin'));

            const delta = el.querySelector('[data-k="delta"]');
            if (prevTotal) {
                const ch = Math.round(((total - prevTotal) / prevTotal) * 100);
                delta.className = `wtc-delta ${ch > 0 ? 'up' : ch < 0 ? 'down' : ''}`;
                delta.textContent = `${ch > 0 ? '+' : ''}${ch}% vs prior week`;
            } else {
                delta.className = 'wtc-delta';
                delta.textContent = '';
            }

            const peak = w.reduce((a, b) => (b.total > a.total ? b : a), w[0]);
            const cancelled = sum(w, 'cancelled');
            el.querySelector('.wtc-foot').textContent = [
                peak.total ? `Busiest: ${dayName(peak.date, { weekday: 'long' })} (${peak.total})` : 'No visits yet this week',
                `${(total / 7).toFixed(1)} per day`,
                `${cancelled} cancelled`
            ].join('  ·  ');
        }

        function build() {
            const W = chart.clientWidth, H = 200, pad = { l: 28, r: 4, t: 18, b: 24 };
            const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b, step = iw / 7;
            const bw = Math.max(10, Math.min(22, step * 0.38)), base = pad.t + ih;
            state.geom = { W, H, pad, iw, ih, step, bw, base };
            const cx = i => pad.l + step * i + step / 2;
            chart.innerHTML = `
                <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
                    ${[0, 1, 2].map(k => `<line class="wtc-grid" x1="${pad.l}" x2="${W - pad.r}" y1="${base - (ih * k) / 2}" y2="${base - (ih * k) / 2}"/><text class="wtc-ax" data-tick="${k}" x="${pad.l - 8}" y="${base - (ih * k) / 2 + 4}" text-anchor="end"></text>`).join('')}
                    ${[0, 1, 2, 3, 4, 5, 6].map(i => `
                        <g class="wtc-col" data-i="${i}" tabindex="0" role="img">
                            <rect class="wtc-hit" x="${pad.l + step * i + 2}" y="${pad.t - 10}" width="${step - 4}" height="${ih + 10}" rx="6"/>
                            ${SERIES.map(s => `<rect data-s="${s.key}" x="${cx(i) - bw / 2}" y="${base}" width="${bw}" height="0" fill="${s.color}"/>`).join('')}
                            <text class="wtc-val" x="${cx(i)}" y="${base}" text-anchor="middle"></text>
                            <text class="wtc-ax wtc-day" x="${cx(i)}" y="${base + 17}" text-anchor="middle"></text>
                        </g>`).join('')}
                </svg>
                <div class="wtc-empty" hidden>No appointments in the last 7 days</div>
                <div class="wtc-tip"></div>`;

            const tip = chart.querySelector('.wtc-tip');
            chart.querySelectorAll('.wtc-col').forEach(col => {
                const show = () => {
                    const i = +col.dataset.i, d = state.week[i], g = state.geom;
                    const row = (label, v) => `<div class="wtc-tip-r"><span>${label}</span><b>${v}</b></div>`;
                    tip.innerHTML = `<div class="wtc-tip-h">${dayName(d.date, { weekday: 'long', month: 'short', day: 'numeric' })}</div>` +
                        SERIES.map(s => row(s.label, d[s.key])).join('') + row('Walk-ins', d.walkin) + row('Cancelled', d.cancelled);
                    const top = g.base - (d.total / state.max) * g.ih;
                    tip.style.left = `${Math.min(Math.max(cx(i), 90), g.W - 90)}px`;
                    tip.style.top = `${Math.max(top - 12, 110)}px`;
                    tip.classList.add('show');
                };
                const hide = () => tip.classList.remove('show');
                col.addEventListener('mouseenter', show); col.addEventListener('focus', show);
                col.addEventListener('mouseleave', hide); col.addEventListener('blur', hide);
            });
        }

        function paint(vals, max) {
            const g = state.geom;
            const y = v => g.base - (Math.max(v, 0) / max) * g.ih;
            const cols = chart.querySelectorAll('.wtc-col');
            vals.forEach((d, i) => {
                let acc = 0;
                const gap = 1.5; // hairline between stacked segments
                SERIES.forEach(s => {
                    const r = cols[i].querySelector(`[data-s="${s.key}"]`), v = Math.max(d[s.key], 0);
                    const y1 = y(acc + v), y0 = y(acc);
                    r.setAttribute('y', y1);
                    r.setAttribute('height', Math.max(y0 - y1 - (v > 0.05 && acc > 0 ? gap : 0), 0));
                    r.setAttribute('rx', 3);
                    acc += v;
                });
                const total = SERIES.reduce((n, s) => n + Math.max(d[s.key], 0), 0);
                const val = cols[i].querySelector('.wtc-val');
                val.textContent = total >= 0.5 ? Math.round(total) : '';
                val.setAttribute('y', y(total) - 7);
            });
            chart.querySelectorAll('[data-tick]').forEach(t => { t.textContent = Math.round((max * +t.dataset.tick) / 2); });
        }

        function label() {
            chart.querySelectorAll('.wtc-col').forEach((col, i) => {
                const d = state.week[i], day = col.querySelector('.wtc-day');
                day.textContent = i === 6 ? 'Today' : dayName(d.date, { weekday: 'short' });
                day.classList.toggle('today', i === 6);
                col.setAttribute('aria-label', `${dayName(d.date, { weekday: 'long', month: 'long', day: 'numeric' })}: ${d.total} visits, ${d.completed} completed, ${d.in_clinic} in clinic, ${d.scheduled} scheduled, ${d.walkin} walk-ins, ${d.cancelled} cancelled`);
            });
            chart.querySelector('.wtc-empty').hidden = state.week.some(d => d.total > 0);
        }

        // Grow from current heights to the new data; a gentle staggered rise on first view
        function draw() {
            if (!state.week || chart.clientWidth === 0) return;
            if (!state.geom || state.geom.W !== chart.clientWidth) { build(); state.shown = null; }
            label();
            const target = state.week, max = niceMax(Math.max(...target.map(d => d.total), 4));
            const intro = state.animateNext && state.visible;
            if (intro) state.animateNext = false;
            const from = intro || !state.shown ? target.map(() => ({ completed: 0, in_clinic: 0, scheduled: 0 })) : state.shown;
            if (reduced() || (!intro && !state.shown)) { paint(target, max); state.shown = target.map(d => ({ ...d })); state.max = max; return; }

            cancelAnimationFrame(state.raf);
            const t0 = performance.now(), D = intro ? 700 : 450, stagger = intro ? 60 : 0;
            const ease = p => 1 - Math.pow(1 - p, 3);
            const frame = now => {
                let done = true;
                const vals = target.map((d, i) => {
                    const p = Math.min(Math.max((now - t0 - i * stagger) / D, 0), 1);
                    if (p < 1) done = false;
                    const e = ease(p), o = {};
                    SERIES.forEach(s => { o[s.key] = from[i][s.key] + (d[s.key] - from[i][s.key]) * e; });
                    return o;
                });
                paint(vals, max);
                state.shown = vals; state.max = max;
                if (!done) state.raf = requestAnimationFrame(frame);
            };
            state.raf = requestAnimationFrame(frame);
        }

        if ('IntersectionObserver' in window) {
            new IntersectionObserver(entries => entries.forEach(e => {
                const was = state.visible;
                state.visible = e.isIntersecting;
                if (state.visible && !was) { state.animateNext = true; draw(); }
            }), { threshold: 0.3 }).observe(chart);
        } else { state.visible = true; }
        if ('ResizeObserver' in window) {
            new ResizeObserver(() => {
                if (state.week && chart.clientWidth && (!state.geom || chart.clientWidth !== state.geom.W)) {
                    build(); paint(state.shown || state.week, state.max); label();
                }
            }).observe(chart);
        }
        setInterval(() => { if (document.visibilityState === 'visible' && el.offsetParent) refresh(); }, POLL_MS);
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && el.offsetParent) refresh(); });

        el._wtc = { refresh };
        refresh();
        return el._wtc;
    }

    window.WeeklyTraffic = { mount };
})();
