
const $ = (s,root=document)=>root.querySelector(s);
const $$ = (s,root=document)=>Array.from(root.querySelectorAll(s));
const state = { rows:[], filtered:[], charts:{} };
const fmt = new Intl.NumberFormat('en-US', {maximumFractionDigits: 1});
const money = v => '$' + (Number(v)||0).toLocaleString();

function parseCSV(text){
  if (window.Papa){
    return new Promise(res=> Papa.parse(text, {header:true, skipEmptyLines:true, complete: r=>res(r.data)}));
  }
  const lines = text.trim().split(/\r?\n/);
  const headers = lines.shift().split(',');
  return Promise.resolve(lines.map(line=>{
    const cells = line.split(',');
    const obj = {}; headers.forEach((h,i)=> obj[h.trim()] = (cells[i]||'').trim());
    return obj;
  }));
}

async function loadSample(){
  const text = await fetch('sample-data.csv').then(r=>r.text());
  const rows = await parseCSV(text);
  setData(rows);
}

function setData(rows){
  rows.forEach(r=>{
    r.units = Number(r.units);
    r.price = Number(r.price);
    r.revenue = Number(r.revenue);
    r.cost = Number(r.cost);
    r.margin = r.revenue - r.cost;
    r.date = new Date(r.date);
  });
  state.rows = rows;
  state.filtered = rows;
  refresh();
}

function applyFilters(){
  const q = $('#search')?.value.toLowerCase().trim() || '';
  const region = $('#f-region')?.value || '';
  const channel = $('#f-channel')?.value || '';
  const product = $('#f-product')?.value || '';
  state.filtered = state.rows.filter(r=>{
    if (region && r.region !== region) return false;
    if (channel && r.channel !== channel) return false;
    if (product && r.product !== product) return false;
    if (q){
      const bag = `${r.region} ${r.channel} ${r.product}`.toLowerCase();
      if (!bag.includes(q)) return false;
    }
    return true;
  });
  refresh();
}
function clearFilters(){
  if ($('#search')) $('#search').value='';
  ['#f-region','#f-channel','#f-product'].forEach(sel=>{
    const el = $(sel); if (el) el.value = '';
  });
  applyFilters();
}

function groupBy(arr, keyFn){ return arr.reduce((a,x)=>{ const k = keyFn(x); (a[k]=a[k]||[]).push(x); return a; },{}); }

function rollingAverage(arr, window=3){
  const out=[];
  for(let i=0;i<arr.length;i++){
    const s = Math.max(0,i-window+1);
    const slice = arr.slice(s,i+1);
    out.push(slice.reduce((a,v)=>a+v,0)/slice.length);
  }
  return out;
}

function refresh(){
  const totalRevenue = state.filtered.reduce((a,r)=>a+r.revenue,0);
  const totalUnits = state.filtered.reduce((a,r)=>a+r.units,0);
  const avgPrice = totalRevenue / Math.max(1,totalUnits);
  const totalMargin = state.filtered.reduce((a,r)=>a+r.margin,0);
  $('#kpi-revenue .val').textContent = money(totalRevenue.toFixed(0));
  $('#kpi-units .val').textContent = fmt.format(totalUnits);
  $('#kpi-price .val').textContent = '$' + (avgPrice||0).toFixed(2);
  $('#kpi-margin .val').textContent = money(totalMargin.toFixed(0));

  drawCoreCharts();
  drawFunnel();
  drawForecast();
  drawCohorts();
  renderTable();
}

function drawCoreCharts(){
  const rows = state.filtered.slice().sort((a,b)=>a.date-b.date);
  const byDate = groupBy(rows, r=> r.date.toISOString().slice(0,10));
  const labels = Object.keys(byDate).sort();
  const revs = labels.map(d=> byDate[d].reduce((a,r)=>a+r.revenue,0));
  upsertChart('ts','line',labels,[{label:'Revenue',data:revs}]);

  const byRegion = groupBy(rows, r=>r.region);
  const rlabels = Object.keys(byRegion);
  const rvals = rlabels.map(k => byRegion[k].reduce((a,r)=>a+r.revenue,0));
  upsertChart('bar','bar',rlabels,[{label:'Revenue by Region',data:rvals}]);

  const byProduct = groupBy(rows, r=>r.product);
  const plabels = Object.keys(byProduct);
  const pvals = plabels.map(k => byProduct[k].reduce((a,r)=>a+r.revenue,0));
  upsertChart('pie','pie',plabels,[{label:'Revenue by Product',data:pvals}]);
}

function drawFunnel(){
  // Fake funnel from filtered data: visits -> add_to_cart -> checkout -> purchases
  const totalUnits = state.filtered.reduce((a,r)=>a+r.units,0);
  const purchases = Math.max(1, totalUnits);
  const checkout = Math.round(purchases * 1.4);
  const addToCart = Math.round(purchases * 2.2);
  const visits = Math.round(purchases * 5.5);
  const labels = ['Visits','Add to Cart','Checkout','Purchases'];
  const data = [visits, addToCart, checkout, purchases];
  upsertChart('funnel','bar',labels,[{label:'Funnel',data, borderWidth:1}], {
    indexAxis:'y',
    scales:{ x:{ ticks:{ color:'#94a3b8' }, grid:{ color:'#1f2937' } }, y:{ ticks:{ color:'#94a3b8' }, grid:{ color:'#1f2937' } } }
  });
}

function drawForecast(){
  const rows = state.filtered.slice().sort((a,b)=>a.date-b.date);
  const byDate = groupBy(rows, r=> r.date.toISOString().slice(0,10));
  const labels = Object.keys(byDate).sort();
  const revs = labels.map(d=> byDate[d].reduce((a,r)=>a+r.revenue,0));
  const ma = rollingAverage(revs,3);
  upsertChart('forecast','line',labels,[{label:'Revenue',data:revs},{label:'3‑pt MA (forecast-ish)',data:ma}]);
}

function drawCohorts(){
  const el = $('#cohort'); if (!el) return;
  el.innerHTML='';
  // Build a 4x6 heatmap (month x cohort) from data
  const rows = state.filtered;
  const regions = Array.from(new Set(rows.map(r=>r.region))).slice(0,4);
  const months = Array.from(new Set(rows.map(r=> (r.date.getMonth()+1)))).slice(0,6);
  function val(region, month){
    return rows.filter(r=>r.region===region && (r.date.getMonth()+1)===month).reduce((a,r)=>a+r.units,0);
  }
  regions.forEach(region=>{
    months.forEach(m=>{
      const v = val(region,m);
      const intensity = Math.min(1, v/300);
      const cell = document.createElement('div');
      cell.className='cell';
      cell.style.background = `rgba(45,212,191, ${0.08 + 0.6*intensity})`;
      cell.style.borderColor = 'rgba(45,212,191,.3)';
      cell.innerHTML = `<div style="font-size:12px;color:#94a3b8">${region} · M${m}</div><div style="font-size:16px;font-weight:700">${v}</div>`;
      el.appendChild(cell);
    });
  });
}

function renderTable(){
  const tbody = $('#tbody'); if (!tbody) return;
  tbody.innerHTML='';
  state.filtered.forEach(r=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.date.toISOString().slice(0,10)}</td>
      <td>${r.region}</td>
      <td>${r.channel}</td>
      <td>${r.product}</td>
      <td>${r.units}</td>
      <td>$${r.price.toFixed(2)}</td>
      <td>${money(r.revenue.toFixed(0))}</td>
      <td>${money(r.margin.toFixed(0))}</td>`;
    tbody.appendChild(tr);
  });
}

// Chart helper
function upsertChart(id,type,labels,datasets,extraOptions={}){
  const ctx = document.getElementById(id)?.getContext('2d');
  if (!ctx) return;
  const existing = state.charts[id];
  const opt = {
    responsive:true,
    plugins:{ legend:{ labels:{ color:'#e6f1ff' } } },
    scales: (type==='pie'? {} : { x:{ ticks:{ color:'#94a3b8' }, grid:{ color:'#1f2937' } }, y:{ ticks:{ color:'#94a3b8' }, grid:{ color:'#1f2937' } } }),
    ...extraOptions
  };
  if (existing){ existing.data.labels = labels; existing.data.datasets = datasets; existing.update(); return; }
  state.charts[id] = new Chart(ctx, { type, data:{labels, datasets}, options: opt });
}

// Events
window.addEventListener('DOMContentLoaded', ()=>{
  const search = $('#search'); if (search) search.addEventListener('input', applyFilters);
  ['#f-region','#f-channel','#f-product'].forEach(sel=> $(sel)?.addEventListener('change', applyFilters));
  $('#btn-clear')?.addEventListener('click', clearFilters);
  $('#file')?.addEventListener('change', async (e)=>{
    const file = e.target.files[0]; if (!file) return;
    const text = await file.text();
    const rows = await parseCSV(text);
    setData(rows);
  });
  loadSample();
});
