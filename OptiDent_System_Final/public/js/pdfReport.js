/**
 * Download any on-screen report table as an official OptiDent PDF (header, footer, page numbers).
 * Usage: OptiPdf.fromTable(tableElement, { title, subtitle, filters: [['Period', 'This month'], ...] })
 * Columns come from the table header; body rows become PDF rows; "totals" rows (cells spanning
 * several columns) become the summary line. Rendering happens on the server (POST /api/reports/pdf).
 */
(function () {
    const text = el => (el.innerText || el.textContent || '').replace(/\s*\n+\s*/g, ' · ').replace(/\s{2,}/g, ' ').trim();

    function readTable(table) {
        const headRow = table.tHead && table.tHead.rows[table.tHead.rows.length - 1];
        const columns = headRow ? Array.from(headRow.cells).map(text) : [];
        const rows = [], summary = [];
        Array.from(table.tBodies).forEach(tb => Array.from(tb.rows).forEach(tr => {
            if (tr.offsetParent === null && tr.style.display === 'none') return; // filtered out on screen
            const cells = Array.from(tr.cells);
            const spans = cells.reduce((n, c) => n + (c.colSpan || 1), 0);
            if (cells.length === columns.length && spans === columns.length) rows.push(cells.map(text));
            else if (cells.length > 1) summary.push(cells.map(text).filter(Boolean).join(' '));
            // a single cell spanning everything is an empty/loading placeholder: skip it
        }));
        return { columns, rows, summary };
    }

    async function fromTable(table, opts = {}) {
        if (!table) throw new Error('Report table not found.');
        const { columns, rows, summary } = readTable(table);
        if (!columns.length) throw new Error('Generate the report first, then download the PDF.');
        const res = await fetch('api/reports/pdf.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: opts.title || 'Report', subtitle: opts.subtitle || '', filters: opts.filters || [], summary: (opts.summary || []).concat(summary), columns, rows })
        });
        if (!res.ok) {
            let msg = 'Could not generate the PDF.';
            try { msg = (await res.json()).message || msg; } catch (_) {}
            throw new Error(msg);
        }
        const blob = await res.blob();
        const name = (res.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name ? name[1] : 'OptiDent_Report.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        return rows.length;
    }

    window.OptiPdf = { fromTable, readTable };
})();
