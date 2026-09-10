/**
 * NSUT CGPA Lookup & Shortlist Enricher
 * Minimal, utility-focused rewrite with Quick Lookup & CGPA Distribution Chart
 */

// ==================== STATE ====================
let db = {};             // rollNo -> { name, rollNo, cgpa, branch }
let dbArray = [];        // array of all students for ranking
let isDbLoaded = false;

// Enricher State
let rawData = [];        // parsed from file
let enriched = [];       // enriched with CGPA
let filtered = [];       // after applying filters
let sortCol = 'cgpa';
let sortDir = 'desc';

// ==================== DOM ELEMENTS ====================
const $ = id => document.getElementById(id);

const UI = {
  ldBar: $('ld-bar'),
  dbPill: $('db-pill'),
  
  // Tabs
  tabs: document.querySelectorAll('.tab'),
  panels: document.querySelectorAll('.panel'),
  
  // Quick Lookup
  lookupInput: $('lookup-input'),
  lookupBtn: $('lookup-btn'),
  lookupRes: $('lookup-result'),
  
  // Enricher
  uploadSec: $('upload-section'),
  dropArea: $('drop-area'),
  fileIn: $('file-input'),
  
  // File Bar
  fileBar: $('file-bar'),
  fName: $('f-name'),
  fMeta: $('f-meta'),
  btnClear: $('btn-clear'),
  
  // Stats
  statsRow: $('stats-row'),
  sTotal: $('s-total'),
  sFound: $('s-found'),
  sMiss: $('s-missing'),
  sAvg: $('s-avg'),
  sHigh: $('s-high'),
  sLow: $('s-low'),
  
  // Chart
  chartCard: $('chart-card'),
  chartBars: $('chart-bars'),
  
  // Controls
  ctrls: $('ctrls'),
  search: $('search'),
  fBranch: $('f-branch'),
  fMin: $('f-min'),
  fMax: $('f-max'),
  fStatus: $('f-status'),
  
  // Table & Actions
  tblWrap: $('tbl-wrap'),
  tbody: $('tbody'),
  chips: $('chips'),
  actRow: $('act-row'),
  dlXlsx: $('dl-xlsx'),
  dlCsv: $('dl-csv'),
  showing: $('showing'),
  emptyMsg: $('empty-msg'),
  
  toasts: $('toasts')
};

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
  loadDB();
  setupEvents();
});

function setupEvents() {
  // Tabs
  UI.tabs.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));
  
  // Quick Lookup
  UI.lookupBtn.addEventListener('click', doLookup);
  UI.lookupInput.addEventListener('keypress', e => e.key === 'Enter' && doLookup());
  
  // File Upload
  UI.dropArea.addEventListener('click', () => UI.fileIn.click());
  UI.fileIn.addEventListener('change', e => e.target.files.length && handleFile(e.target.files[0]));
  UI.dropArea.addEventListener('dragover', e => { e.preventDefault(); UI.dropArea.classList.add('over'); });
  UI.dropArea.addEventListener('dragleave', () => UI.dropArea.classList.remove('over'));
  UI.dropArea.addEventListener('drop', e => {
    e.preventDefault();
    UI.dropArea.classList.remove('over');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
  
  UI.btnClear.addEventListener('click', clearFile);
  
  // Filters
  UI.search.addEventListener('input', debounce(applyFilters, 200));
  UI.fBranch.addEventListener('change', applyFilters);
  UI.fMin.addEventListener('input', debounce(applyFilters, 300));
  UI.fMax.addEventListener('input', debounce(applyFilters, 300));
  UI.fStatus.addEventListener('change', applyFilters);
  
  // Sort
  document.querySelectorAll('thead th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else { sortCol = col; sortDir = col === 'cgpa' ? 'desc' : 'asc'; }
      applyFilters();
      updateSortUI();
    });
  });
  
  // Exports
  UI.dlXlsx.addEventListener('click', downloadExcel);
  UI.dlCsv.addEventListener('click', downloadCSV);
}

function switchTab(tabId) {
  UI.tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
  UI.panels.forEach(p => p.classList.toggle('active', p.id === 'panel-' + tabId));
}

// ==================== DB LOAD ====================
async function loadDB() {
  loading(true);
  try {
    const res = await fetch('student_name_rollnumber_aggregate_cgpa.csv');
    if (!res.ok) throw new Error('File not found');
    const text = await res.text();
    
    const lines = text.trim().split('\n');
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const parts = parseCSVLine(lines[i]);
      if (parts.length < 3) continue;
      
      const name = parts[0].trim();
      const rollNo = parts[1].trim().toUpperCase();
      const cgpa = parseFloat(parts[2]);
      
      if (rollNo && !isNaN(cgpa)) {
        const branch = getBranch(rollNo);
        const obj = { name, rollNo, cgpa, branch };
        db[rollNo] = obj;
        dbArray.push(obj);
      }
    }
    
    // Sort DB by CGPA desc to assign global ranks
    dbArray.sort((a, b) => b.cgpa - a.cgpa);
    
    isDbLoaded = true;
    UI.dbPill.innerHTML = `${dbArray.length} Loaded`;
    UI.dbPill.style.color = 'var(--green)';
    UI.dbPill.style.borderColor = 'rgba(52,211,153,0.3)';
    UI.dbPill.style.background = 'rgba(52,211,153,0.1)';
    
  } catch (err) {
    UI.dbPill.innerHTML = `DB Error`;
    UI.dbPill.style.color = 'var(--red)';
    toast('error', 'Failed to load database.');
  } finally {
    loading(false);
  }
}

// ==================== QUICK LOOKUP ====================
function doLookup() {
  if (!isDbLoaded) return toast('error', 'Database not ready');
  
  const query = UI.lookupInput.value.trim().toUpperCase();
  if (!query) return;
  
  const student = db[query];
  
  if (!student) {
    UI.lookupRes.innerHTML = `<div class="lr-notfound">Roll number '${query}' not found.</div>`;
    UI.lookupRes.className = 'lookup-result not-found';
    return;
  }
  
  // Calculate Rank
  const rank = dbArray.findIndex(s => s.rollNo === student.rollNo) + 1;
  const total = dbArray.length;
  const topPercent = ((rank / total) * 100).toFixed(1);
  
  const cClass = student.cgpa >= 8.5 ? 'high' : student.cgpa >= 7 ? 'mid' : 'low';
  
  UI.lookupRes.className = 'lookup-result';
  UI.lookupRes.innerHTML = `
    <div class="lr-header">
      <div class="lr-name">${escapeHTML(student.name)}</div>
      <div class="lr-cgpa ${cClass}">${student.cgpa.toFixed(3)}</div>
    </div>
    <div class="lr-body">
      <div class="lr-cell">
        <div class="lr-cell-label">Roll No</div>
        <div class="lr-cell-value" style="font-family: monospace">${student.rollNo}</div>
      </div>
      <div class="lr-cell">
        <div class="lr-cell-label">Branch</div>
        <div class="lr-cell-value">${student.branch}</div>
      </div>
      <div class="lr-cell">
        <div class="lr-cell-label">Rank</div>
        <div class="lr-cell-value">${rank} <span style="font-size:11px;color:var(--text-3);font-weight:400">/ ${total} (Top ${topPercent}%)</span></div>
      </div>
    </div>
  `;
}

// ==================== ENRICHER FILE HANDLER ====================
async function handleFile(file) {
  if (!isDbLoaded) return toast('error', 'DB not ready.');
  
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['csv','xls','xlsx','pdf'].includes(ext)) {
    return toast('error', 'Invalid file type.');
  }
  
  loading(true);
  
  try {
    if (ext === 'pdf') await handlePDF(file);
    else if (ext === 'csv') {
      const text = await file.text();
      processFile(parseUploadedCSV(text), file);
    } else {
      const buf = await file.arrayBuffer();
      processFile(parseExcel(buf), file);
    }
  } catch (err) {
    console.error(err);
    toast('error', err.message || 'File read error');
    loading(false);
  }
}

function processFile(data, file) {
  if (!data.length) {
    loading(false);
    return toast('error', 'No students found in file.');
  }
  
  rawData = data;
  enriched = data.map((st, i) => {
    let roll = (st.rollNo || '').toUpperCase().trim();
    let name = (st.name || '').trim();
    
    let dbMatch = db[roll];
    if (!dbMatch && name) {
      const nu = name.toUpperCase();
      dbMatch = dbArray.find(x => x.name.toUpperCase() === nu);
    }
    
    return {
      idx: i + 1,
      name: name || (dbMatch ? dbMatch.name : ''),
      rollNo: roll || (dbMatch ? dbMatch.rollNo : ''),
      branch: dbMatch ? dbMatch.branch : getBranch(roll),
      cgpa: dbMatch ? dbMatch.cgpa : null,
      found: !!dbMatch
    };
  });
  
  // UI setup
  UI.uploadSec.classList.add('hidden');
  UI.fileBar.classList.remove('hidden');
  UI.statsRow.classList.remove('hidden');
  UI.chartCard.classList.remove('hidden');
  UI.ctrls.classList.remove('hidden');
  UI.actRow.classList.remove('hidden');
  UI.chips.classList.remove('hidden');
  UI.tblWrap.classList.remove('hidden');
  
  UI.fName.textContent = file.name;
  UI.fMeta.textContent = `${data.length} rows • ${(file.size/1024).toFixed(1)} KB`;
  
  buildBranchFilter();
  renderChips();
  applyFilters();
  
  loading(false);
  toast('success', `Processed ${data.length} students`);
}

// ==================== CSV / EXCEL PARSING ====================
function parseUploadedCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map(x => x.toLowerCase().trim());
  const rCol = headers.findIndex(h => /roll|enrol/.test(h));
  const nCol = headers.findIndex(h => /name/.test(h));
  
  let students = [];
  // basic heuristic
  if (rCol===-1 && nCol===-1 && lines.length>1) {
     const row1 = parseCSVLine(lines[1]);
     if (row1.length>=2 && /20\d{2}/.test(row1[1])) {
       for(let i=1; i<lines.length; i++) {
         const p = parseCSVLine(lines[i]);
         if(p.length>=2) students.push({name:p[0].trim(), rollNo:p[1].trim()});
       }
       return students;
     }
  }
  
  for(let i=1; i<lines.length; i++) {
    const p = parseCSVLine(lines[i]);
    const r = rCol>-1?p[rCol]||'':'';
    const n = nCol>-1?p[nCol]||'':'';
    if(r||n) students.push({name:n.trim(), rollNo:r.trim()});
  }
  return students;
}

function parseExcel(buf) {
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  if(!json.length) return [];
  
  const keys = Object.keys(json[0]);
  const kL = keys.map(k=>k.toLowerCase().trim());
  const rK = keys[kL.findIndex(k=>/roll|enrol/.test(k))];
  const nK = keys[kL.findIndex(k=>/name/.test(k))];
  
  return json.map(row => ({
    name: nK ? String(row[nK]).trim() : '',
    rollNo: rK ? String(row[rK]).trim() : ''
  })).filter(x=>x.name||x.rollNo);
}

// ==================== PDF PARSING ====================
async function handlePDF(file) {
  const buf = await file.arrayBuffer();
  if(!window.pdfjsLib) {
    await new Promise((res,rej)=>{
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  
  const pdf = await window.pdfjsLib.getDocument({data: buf}).promise;
  let text = '';
  for(let i=1; i<=pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    text += tc.items.map(x=>x.str).join(' ') + '\n';
  }
  
  const data = [];
  const seen = new Set();
  const rx = /\b(20\d{2}U[A-Z]{2,4}\d{3,5})\b/gi;
  
  const lines = text.split('\n');
  for(const l of lines) {
    for(const m of [...l.matchAll(rx)]) {
      const roll = m[1].toUpperCase();
      if(seen.has(roll)) continue;
      seen.add(roll);
      
      let name = '';
      const idx = l.indexOf(m[0]);
      const bef = l.substring(0, idx).trim();
      const nmMatch = bef.match(/([A-Z][A-Za-z\s.]{2,})\s*$/);
      if(nmMatch && !/^(S\.NO|ROLL|NAME)/i.test(nmMatch[1])) {
        name = nmMatch[1].replace(/^\d+\.?\s*/, '').trim();
      }
      if(!name && db[roll]) name = db[roll].name;
      
      data.push({name, rollNo: roll});
    }
  }
  
  processFile(data, file);
}

// ==================== FILTERS & RENDER ====================
function applyFilters() {
  const q = UI.search.value.toLowerCase().trim();
  const b = UI.fBranch.value;
  const min = parseFloat(UI.fMin.value) || 0;
  const max = parseFloat(UI.fMax.value) || 10;
  const st = UI.fStatus.value;
  
  filtered = enriched.filter(x => {
    if(q && !x.name.toLowerCase().includes(q) && !x.rollNo.toLowerCase().includes(q)) return false;
    if(b && x.branch !== b) return false;
    if(x.cgpa !== null) {
      if(x.cgpa < min || x.cgpa > max) return false;
    } else if(min > 0) return false;
    if(st==='found' && !x.found) return false;
    if(st==='notfound' && x.found) return false;
    return true;
  });
  
  filtered.sort((a,b) => {
    let v1 = a[sortCol], v2 = b[sortCol];
    if(sortCol==='cgpa') { v1 = v1??-1; v2 = v2??-1; }
    if(sortCol==='status') { v1=a.found?1:0; v2=b.found?1:0; }
    if(sortCol==='index') { v1=a.idx; v2=b.idx; }
    
    if(typeof v1 === 'string') return sortDir==='asc' ? v1.localeCompare(v2) : v2.localeCompare(v1);
    return sortDir==='asc' ? v1 - v2 : v2 - v1;
  });
  
  renderTable();
  updateStatsAndChart();
}

function renderTable() {
  UI.showing.innerHTML = `Showing <b>${filtered.length}</b> of ${enriched.length}`;
  if(!filtered.length) {
    UI.tblWrap.classList.add('hidden');
    UI.emptyMsg.classList.remove('hidden');
    return;
  }
  UI.tblWrap.classList.remove('hidden');
  UI.emptyMsg.classList.add('hidden');
  
  const frag = document.createDocumentFragment();
  filtered.forEach(x => {
    const tr = document.createElement('tr');
    const cClass = x.cgpa===null ? '' : (x.cgpa>=8.5?'high':x.cgpa>=7?'mid':'low');
    tr.innerHTML = `
      <td class="col-idx">${x.idx}</td>
      <td class="col-name">${escapeHTML(x.name)}</td>
      <td class="col-roll">${escapeHTML(x.rollNo)}</td>
      <td><span class="badge-br">${escapeHTML(x.branch)}</span></td>
      <td class="col-cgpa ${cClass}">${x.cgpa!==null ? x.cgpa.toFixed(3) : '—'}</td>
      <td class="col-st ${x.found?'ok':'no'}">${x.found?'Found':'Missing'}</td>
    `;
    frag.appendChild(tr);
  });
  UI.tbody.innerHTML = '';
  UI.tbody.appendChild(frag);
}

function updateSortUI() {
  document.querySelectorAll('thead th[data-col]').forEach(th => {
    th.classList.remove('asc','desc');
    const arr = th.querySelector('.arr');
    if(arr) arr.textContent = '↕';
    if(th.dataset.col === sortCol) {
      th.classList.add(sortDir);
      if(arr) arr.textContent = sortDir==='asc' ? '↑' : '↓';
    }
  });
}

function updateStatsAndChart() {
  const tot = enriched.length;
  const fnd = enriched.filter(x=>x.found).length;
  const cgpas = enriched.filter(x=>x.cgpa!==null).map(x=>x.cgpa);
  
  UI.sTotal.textContent = tot;
  UI.sFound.textContent = fnd;
  UI.sMiss.textContent = tot - fnd;
  
  if(cgpas.length) {
    UI.sAvg.textContent = (cgpas.reduce((a,b)=>a+b,0)/cgpas.length).toFixed(3);
    UI.sHigh.textContent = Math.max(...cgpas).toFixed(3);
    UI.sLow.textContent = Math.min(...cgpas).toFixed(3);
  } else {
    UI.sAvg.textContent = '—'; UI.sHigh.textContent = '—'; UI.sLow.textContent = '—';
  }
  
  renderChart(cgpas);
}

// ==================== CHART ====================
function renderChart(cgpas) {
  if(!cgpas.length) {
    UI.chartBars.innerHTML = '<div style="color:var(--text-3);width:100%;text-align:center;font-size:12px;align-self:center">No CGPA data</div>';
    return;
  }
  
  const bins = [
    { label: '<6', min:0, max:6, c:0, color: 'var(--red)' },
    { label: '6-7', min:6, max:7, c:0, color: 'var(--yellow)' },
    { label: '7-8', min:7, max:8, c:0, color: 'var(--green)' },
    { label: '8-9', min:8, max:9, c:0, color: 'var(--blue)' },
    { label: '9+', min:9, max:10.1, c:0, color: 'var(--purple)' }
  ];
  
  cgpas.forEach(v => {
    const bin = bins.find(b => v >= b.min && v < b.max);
    if(bin) bin.c++;
  });
  
  const maxVal = Math.max(...bins.map(b=>b.c)) || 1;
  
  UI.chartBars.innerHTML = '';
  bins.forEach(b => {
    const h = Math.max(2, (b.c / maxVal) * 100);
    const col = document.createElement('div');
    col.className = 'chart-bar-col';
    col.innerHTML = `
      <div class="chart-bar-count" style="opacity: ${b.c===0?0.3:1}">${b.c}</div>
      <div class="chart-bar" style="height: ${h}%; background: ${b.c===0?'var(--surface-3)':b.color}"></div>
      <div class="chart-bar-label">${b.label}</div>
    `;
    UI.chartBars.appendChild(col);
  });
}

// ==================== EXPORTS ====================
function downloadExcel() {
  const exp = filtered.map(x=>({
    '#': x.idx, Name: x.name, 'Roll Number': x.rollNo,
    Branch: x.branch, CGPA: x.cgpa!==null?x.cgpa:'N/A',
    Status: x.found?'Found':'Not Found'
  }));
  const ws = XLSX.utils.json_to_sheet(exp);
  ws['!cols'] = [{wch:5}, {wch:25}, {wch:15}, {wch:8}, {wch:8}, {wch:12}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, 'shortlist_enriched.xlsx');
}

function downloadCSV() {
  const hdr = '#,Name,Roll Number,Branch,CGPA,Status\n';
  const rows = filtered.map(x=>`${x.idx},"${x.name}","${x.rollNo}","${x.branch}",${x.cgpa!==null?x.cgpa:'N/A'},${x.found?'Found':'Not Found'}`).join('\n');
  const b = new Blob([hdr+rows], {type:'text/csv'});
  const u = URL.createObjectURL(b);
  const a = document.createElement('a');
  a.href = u; a.download = 'shortlist_enriched.csv'; a.click();
}

// ==================== UTILS ====================
function buildBranchFilter() {
  const brs = new Set();
  enriched.forEach(x => { if(x.branch && x.branch!=='—') brs.add(x.branch); });
  UI.fBranch.innerHTML = '<option value="">All Branches</option>';
  [...brs].sort().forEach(b => {
    const opt = document.createElement('option');
    opt.value = b;
    opt.textContent = b;
    UI.fBranch.appendChild(opt);
  });
}

function renderChips() {
  const cts = {};
  enriched.filter(x=>x.found).forEach(x => { cts[x.branch] = (cts[x.branch]||0)+1; });
  const srt = Object.entries(cts).sort((a,b)=>b[1]-a[1]);
  UI.chips.innerHTML = '';
  srt.forEach(([b, c]) => {
    const el = document.createElement('div');
    el.className = 'chip';
    el.innerHTML = `${b} <b>${c}</b>`;
    el.onclick = () => {
      UI.fBranch.value = UI.fBranch.value === b ? '' : b;
      document.querySelectorAll('.chip').forEach(x=>x.classList.remove('on'));
      if(UI.fBranch.value===b) el.classList.add('on');
      applyFilters();
    };
    UI.chips.appendChild(el);
  });
}

function clearFile() {
  enriched = []; filtered = [];
  UI.fileIn.value = '';
  
  UI.fileBar.classList.add('hidden');
  UI.statsRow.classList.add('hidden');
  UI.chartCard.classList.add('hidden');
  UI.ctrls.classList.add('hidden');
  UI.actRow.classList.add('hidden');
  UI.chips.classList.add('hidden');
  UI.tblWrap.classList.add('hidden');
  UI.emptyMsg.classList.add('hidden');
  UI.uploadSec.classList.remove('hidden');
  
  UI.search.value = ''; UI.fBranch.value = '';
  UI.fMin.value = ''; UI.fMax.value = ''; UI.fStatus.value = '';
}

function getBranch(roll) {
  const m = roll.match(/\d{4}U([A-Z]{2,4})\d+/i);
  if(!m) return '—';
  const c = m[1].toUpperCase();
  const map = { CS:'CSE', CA:'CSAI', CD:'CSDA', CDS:'CSDS', EC:'ECE', EE:'EE', EA:'ECAM', IT:'IT', BT:'BT', CE:'CE', ME:'ME', CI:'CIOT', EI:'ECIOT', GI:'GI', IC:'ICE', IN:'ITNS', CM:'MAC', MV:'MEEV', MI:'MI' };
  return map[c] || map[c.substring(0,2)] || c;
}

function parseCSVLine(line) {
  const res = []; let cur = '', iq = false;
  for(let c of line) {
    if(c==='"') iq=!iq;
    else if(c===',' && !iq) { res.push(cur); cur=''; }
    else cur+=c;
  }
  res.push(cur); return res;
}

function escapeHTML(s) {
  const d = document.createElement('div'); d.textContent = s; return d.innerHTML;
}

function debounce(f, d) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(()=>f.apply(this,a), d); };
}

function loading(v) { UI.ldBar.classList.toggle('on', v); }

function toast(t, m) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span style="font-size:14px">${t==='success'?'✅':t==='error'?'❌':'ℹ️'}</span> ${m}`;
  UI.toasts.appendChild(el);
  setTimeout(() => {
    el.style.opacity = 0; el.style.transform = 'translateY(12px) scale(0.96)';
    setTimeout(()=>el.remove(), 350);
  }, 3500);
}
