/**
 * Lists the clinic's shared reports (uploaded by the receptionist) into a container.
 * Usage: loadSharedReports('reportsList')  or  loadSharedReports(element)
 */
(function () {
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    async function loadSharedReports(target) {
        const el = typeof target === 'string' ? document.getElementById(target) : target;
        if (!el) return;
        el.innerHTML = '<div style="font-size: 12px; color: #64748b;">Loading reports…</div>';
        try {
            const res = await fetch('api/shared_reports/list.php');
            const data = await res.json();
            if (data.status !== 'success') throw new Error(data.message || 'Could not load reports.');
            if (!data.reports.length) {
                el.innerHTML = '<div style="font-size: 12px; color: #64748b;">No reports uploaded yet.</div>';
                return;
            }
            el.innerHTML = data.reports.map(r => `
                <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; margin-bottom: 10px; background: #fff;">
                    <div style="font-weight: 700; font-size: 14px; color: #0f172a;">${esc(r.title)}${r.patient_name ? ` — ${esc(r.patient_name)}` : ''}</div>
                    <div style="font-size: 11px; color: #64748b; margin-top: 2px;">${esc(r.file_name)} · uploaded by ${esc(r.uploaded_by)} · ${esc(r.created_at)}</div>
                    <a href="${esc(r.file_url)}" target="_blank" rel="noopener" style="font-size: 12px; font-weight: 700; color: #0eb1b1;">Open file</a>
                </div>`).join('');
        } catch (err) {
            el.innerHTML = `<div style="font-size: 12px; color: #ef4444;">${esc(err.message)}</div>`;
        }
    }

    window.loadSharedReports = loadSharedReports;
})();
