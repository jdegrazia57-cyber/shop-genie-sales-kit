/* ---------- tiny helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const fmtMoney = n => isFinite(n) ? `$${n.toLocaleString(undefined, {maximumFractionDigits: 0})}` : '—';
const fmtNum   = n => isFinite(n) ? n.toLocaleString() : '—';
const toNum    = v => (v === null || v === undefined || v === '') ? NaN : +(`${v}`.replace(/[$,%\s]/g, ''));

/* ---------- CSV parsing (simple, robust) ---------- */
function parseCSV(text) {
  // Split lines, handle quoted commas minimally
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim().length);
  const head  = lines.shift().split(',').map(h => h.trim());
  const rows  = lines.map(line => {
    // naive split first; handle quoted values that include commas
    let parts = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"' && line[i+1] === '"') { cur += '"'; i++; continue; }
      if (c === '"') { inQ = !inQ; continue; }
      if (c === ',' && !inQ) { parts.push(cur); cur=''; continue; }
      cur += c;
    }
    parts.push(cur);
    const obj = {};
    head.forEach((h, i) => obj[h] = (parts[i] ?? '').trim());
    return obj;
  });
  return { headers: head, rows };
}

/* ---------- KPI calc ---------- */
function computeKPIs(rows) {
  // try to find likely columns
  const headers = Object.keys(rows[0] || {}).reduce((acc, h) => {
    acc[h.toLowerCase()] = h; return acc;
  }, {});
  const hRevenue = headers['revenue'] || headers['sales'] || headers['amount'] || null;
  const hUnits   = headers['units']   || headers['quantity'] || null;
  const hMargin  = headers['margin']  || headers['margin%']  || headers['gross_margin'] || null;

  let sumRev = 0, sumUnits = 0, sumMargin = 0, marginCount = 0;
  rows.forEach(r => {
    if (hRevenue) sumRev += toNum(r[hRevenue]);
    if (hUnits)   sumUnits += toNum(r[hUnits]);
    if (hMargin) {
      const m = toNum(r[hMargin]);
      if (!isNaN(m)) { sumMargin += m; marginCount++; }
    }
  });
  const avgMargin = marginCount ? (sumMargin / marginCount) : NaN;

  return {
    revenue: sumRev,
    units:   sumUnits,
    margin:  avgMargin
  };
}

/* ---------- Table render + sort ---------- */
function renderTable({ headers, rows }) {
  const table = $('#dataTable');
  if (!table) return;

  // build header
  table.innerHTML = `
    <thead>
      <tr>
        ${headers.map(h => `<th data-key="${h}">${h}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${rows.map(r => `
        <tr>${headers.map(h => `<td>${r[h] ?? ''}</td>`).join('')}</tr>
      `).join('')}
    </tbody>
  `;

  // simple sort on click
  const ths = $$('th', table);
  ths.forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      const idx = headers.indexOf(key);
      const body = $('tbody', table);
      const trs = $$('tr', body);
      const asc = th.dataset.sort !== 'asc';
      ths.forEach(t => t.removeAttribute('data-sort'));
      th.dataset.sort = asc ? 'asc' : 'desc';

      trs.sort((a, b) => {
        const va = a.children[idx].textContent.trim();
        const vb = b.children[idx].textContent.trim();
        const na = toNum(va), nb = toNum(vb);
        const isNum = !(isNaN(na) || isNaN(nb));
        const cmp = isNum ? (na - nb) : va.localeCompare(vb);
        return asc ? cmp : -cmp;
      }).forEach(tr => body.appendChild(tr));
    });
  });
}

/* ---------- Canvas line chart (sales over rows) ---------- */
function renderLineChart(rows) {
  const c = $('#salesChart');
  if (!c) return;
  const ctx = c.getContext('2d');
  const W = c.width, H = c.height;
  ctx.clearRect(0,0,W,H);

  // find a revenue-like column
  const headers = Object.keys(rows[0] || {}).reduce((acc, h) => { acc[h.toLowerCase()] = h; return acc; }, {});
  const hRevenue = headers['revenue'] || headers['sales'] || headers['amount'] || null;
  if (!hRevenue) {
    ctx.fillStyle = '#9fd';
    ctx.fillText('No Revenue column found', 12, 20);
    return;
  }

  const series = rows.map(r => toNum(r[hRevenue])).filter(n => isFinite(n));
  if (series.length < 2) {
    ctx.fillStyle = '#9fd';
    ctx.fillText('Not enough data to chart', 12, 20);
    return;
  }

  // padding
  const pad = 32, x0 = pad, x1 = W - pad, y0 = H - pad, y1 = pad;
  const min = Math.min(...series), max = Math.max(...series);
  const rng = Math.max(1, max - min);
  const xAt = i => x0 + (i/(series.length-1))*(x1-x0);
  const yAt = v => y0 - ((v - min)/rng)*(y0 - y1);

  // axes
  ctx.strokeStyle = '#2a3647';
  ctx.beginPath(); ctx.moveTo(x0, y1); ctx.lineTo(x0, y0); ctx.lineTo(x1, y0); ctx.stroke();

  // line
  ctx.strokeStyle = '#2de3a7';
  ctx.lineWidth = 2;
  ctx.beginPath();
  series.forEach((v,i) => (i?ctx.lineTo(xAt(i), yAt(v)):ctx.moveTo(xAt(i), yAt(v))));
  ctx.stroke();

  // points
  ctx.fillStyle = '#2de3a7';
  series.forEach((v,i)=>{ ctx.beginPath(); ctx.arc(xAt(i), yAt(v), 2.5, 0, Math.PI*2); ctx.fill(); });
}

/* ---------- Hook up CSV input + sample link ---------- */
async function loadText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return await res.text();
}

async function handleCSVText(text) {
  const parsed = parseCSV(text);
  if (!parsed.rows.length) return;

  // KPIs
  const k = computeKPIs(parsed.rows);
  const kpiCards = $$('.kpi-card');
  if (kpiCards[0]) kpiCards[0].innerHTML = `<strong>${fmtMoney(k.revenue)}</strong><div>Total Revenue</div>`;
  if (kpiCards[1]) kpiCards[1].innerHTML = `<strong>${fmtNum(k.units)}</strong><div>Units</div>`;
  if (kpiCards[2]) kpiCards[2].innerHTML = `<strong>${isFinite(k.margin)?(k.margin.toFixed(1)+'%'):'—'}</strong><div>Avg Margin</div>`;

  // Table + Chart
  renderTable(parsed);
  renderLineChart(parsed.rows);
}

function bindInputs() {
  const input = $('#csvUpload');
  if (input) {
    input.addEventListener('change', () => {
      const f = input.files && input.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => handleCSVText(reader.result);
      reader.readAsText(f);
    });
  }

  // If there's a link to sample-data.csv in the page, pre-load it on first visit
  // or auto-load for convenience:
  loadText('sample-data.csv').then(handleCSVText).catch(()=>{ /* ignore if missing */ });
}

/* ---------- Boot ---------- */
document.addEventListener('DOMContentLoaded', bindInputs);
