// ── Supabase ───────────────────────────────────────────────────────────────────
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// ── Constants ──────────────────────────────────────────────────────────────────
const SAMPLE_KEYS = ['brain','liver','kidney','blood','spleen','lung','heart','serum','plasma',
  'dna','rna','muscle','bone_marrow','adipose','pancreas','intestine','csf','urine','feces','skin'];
const SAMPLE_LABELS = {
  brain:'Brain',liver:'Liver',kidney:'Kidney',blood:'Blood',spleen:'Spleen',
  lung:'Lung',heart:'Heart',serum:'Serum',plasma:'Plasma',dna:'DNA',rna:'RNA',
  muscle:'Muscle',bone_marrow:'Bone Marrow',adipose:'Adipose Tissue',
  pancreas:'Pancreas',intestine:'Intestine',csf:'CSF',urine:'Urine',feces:'Feces',skin:'Skin'
};
const ALL_SAMPLE_LABELS = Object.values(SAMPLE_LABELS);
const CHART_COLORS = ['#534AB7','#0F6E56','#993C1D','#185FA5','#854F0B','#993556','#3B6D11','#A32D2D','#5F5E5A','#2B6CB0'];
const USER_KEY    = 'asr_username';
const RECALL_KEY  = 'asr_recall';
const MAX_RECALL  = 5;

// ── State ──────────────────────────────────────────────────────────────────────
let currentUser = null;
let records = [], notes = [], auditLog = [];
let currentTags = [], editTags = [], pendingImport = [];
let sortCol = '', sortDir = 1;
let editingId = null;   // UUID of record being edited

// ── Boot ───────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  buildSampleGrids();
  document.getElementById('pn-date').value = today();
  const saved = localStorage.getItem(USER_KEY);
  if (saved) { currentUser = { name: saved }; await showApp(); }
  else { hide('loading'); show('login-screen','flex'); }
});

async function doLogin() {
  const name = document.getElementById('login-name').value.trim();
  if (!name || name.length < 2) {
    document.getElementById('login-err').textContent = 'Please enter at least 2 characters.';
    return;
  }
  localStorage.setItem(USER_KEY, name);
  currentUser = { name };
  hide('login-screen');
  show('loading','flex');
  await showApp();
}

function doSignOut() {
  localStorage.removeItem(USER_KEY);
  currentUser = null; records = []; notes = []; auditLog = [];
  hide('app');
  document.getElementById('login-name').value = '';
  document.getElementById('login-err').textContent = '';
  show('login-screen','flex');
}

async function showApp() {
  document.getElementById('user-pill').textContent = '🐭 ' + currentUser.name;
  document.getElementById('f-enteredby').value = currentUser.name;
  document.getElementById('pn-author').value   = currentUser.name;
  renderRecallBar();

  try { await Promise.all([fetchRecords(), fetchNotes(), fetchAudit()]); }
  catch(e) { console.error('Fetch error:', e); }

  hide('loading');
  show('app','block');
  updateStats(); renderTable(); renderNotes(); renderCharts(); renderAudit(); populateAnimalSelects();

  // Realtime
  supabase.channel('animals-ch')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'animals' }, () => {
      fetchRecords().then(() => { updateStats(); renderTable(); renderCharts(); populateAnimalSelects(); });
    }).subscribe();
  supabase.channel('notes-ch')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'phenotype_notes' }, () => {
      fetchNotes().then(() => renderNotes());
    }).subscribe();
  supabase.channel('audit-ch')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_log' }, p => {
      auditLog.unshift(p.new); renderAudit();
    }).subscribe();
}

// ── Fetch ──────────────────────────────────────────────────────────────────────
async function fetchRecords() {
  const { data, error } = await supabase.from('animals').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  records = data || [];
}
async function fetchNotes() {
  const { data, error } = await supabase.from('phenotype_notes').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  notes = data || [];
}
async function fetchAudit() {
  const { data, error } = await supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(300);
  if (error) throw error;
  auditLog = data || [];
}
async function logAudit(action, detail) {
  await supabase.from('audit_log').insert({ user_name: currentUser.name, action, detail });
}

// ── Sample grids ───────────────────────────────────────────────────────────────
function buildSampleGrids() {
  ['sample-grid','e-sample-grid'].forEach(gid => {
    const prefix = gid === 'sample-grid' ? 's-' : 'es-';
    const grid = document.getElementById(gid);
    SAMPLE_KEYS.forEach(k => {
      const lbl = document.createElement('label');
      lbl.className = 'sample-cb';
      lbl.innerHTML = `<input type="checkbox" id="${prefix}${k}" /> ${SAMPLE_LABELS[k]}`;
      grid.appendChild(lbl);
    });
  });
}

// ── Recall (recent entries) ────────────────────────────────────────────────────
function getRecall() {
  try { return JSON.parse(localStorage.getItem(RECALL_KEY) || '[]'); } catch { return []; }
}
function saveToRecall(entry) {
  let list = getRecall().filter(e => e.label !== entry.label);
  list.unshift(entry);
  list = list.slice(0, MAX_RECALL);
  localStorage.setItem(RECALL_KEY, JSON.stringify(list));
  renderRecallBar();
}
function renderRecallBar() {
  const list = getRecall();
  const bar  = document.getElementById('recall-bar');
  const pills = document.getElementById('recall-pills');
  if (!list.length) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  pills.innerHTML = list.map((e, i) =>
    `<button class="recall-pill" onclick="applyRecall(${i})" title="Click to pre-fill form">${e.label}</button>`
  ).join('');
}
function applyRecall(i) {
  const e = getRecall()[i];
  if (!e) return;
  document.getElementById('f-owner').value    = e.owner    || '';
  document.getElementById('f-species').value  = e.species  || '';
  document.getElementById('f-gender').value   = e.gender   || '';
  document.getElementById('f-genotype').value = e.genotype || '';
  document.getElementById('f-litter').value   = e.litter   || '';
  document.getElementById('f-cohort').value   = e.cohort   || '';
  currentTags = e.tags || [];
  renderTagPills();
  if (e.samples) {
    SAMPLE_KEYS.forEach(k => {
      const el = document.getElementById('s-'+k);
      if (el) el.checked = e.samples.includes(SAMPLE_LABELS[k]);
    });
  }
}
function clearRecall() {
  localStorage.removeItem(RECALL_KEY);
  renderRecallBar();
}

// ── Tab switching ──────────────────────────────────────────────────────────────
function switchTab(t) {
  const tabs = ['add','import','search','charts','phenotype','audit'];
  document.querySelectorAll('.tab').forEach((el,i) => el.classList.toggle('active', tabs[i] === t));
  tabs.forEach(p => document.getElementById('panel-'+p).classList.toggle('active', p === t));
  if (t === 'search')   { updateStats(); renderTable(); }
  if (t === 'charts')   { renderCharts(); }
  if (t === 'phenotype'){ populateAnimalSelects(); renderNotes(); }
  if (t === 'audit')    { renderAudit(); }
}

// ── Tags (add form) ────────────────────────────────────────────────────────────
function handleTag(e) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const val = e.target.value.trim().replace(/,$/, '');
    if (val && !currentTags.includes(val)) { currentTags.push(val); renderTagPills(); }
    e.target.value = '';
  }
  if (e.key === 'Backspace' && !e.target.value && currentTags.length) { currentTags.pop(); renderTagPills(); }
}
function removeTag(t) { currentTags = currentTags.filter(x => x !== t); renderTagPills(); }
function renderTagPills() {
  const wrap = document.getElementById('tag-wrap'), input = document.getElementById('tag-input');
  wrap.innerHTML = '';
  currentTags.forEach(t => {
    const p = document.createElement('span'); p.className = 'tag-pill';
    p.innerHTML = `${esc(t)}<button class="tag-rm" onclick="removeTag('${t.replace(/'/g,"\\'")}')">×</button>`;
    wrap.appendChild(p);
  });
  wrap.appendChild(input);
}

// ── Tags (edit form) ───────────────────────────────────────────────────────────
function handleEditTag(e) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const val = e.target.value.trim().replace(/,$/, '');
    if (val && !editTags.includes(val)) { editTags.push(val); renderEditTagPills(); }
    e.target.value = '';
  }
  if (e.key === 'Backspace' && !e.target.value && editTags.length) { editTags.pop(); renderEditTagPills(); }
}
function removeEditTag(t) { editTags = editTags.filter(x => x !== t); renderEditTagPills(); }
function renderEditTagPills() {
  const wrap = document.getElementById('e-tag-wrap'), input = document.getElementById('e-tag-input');
  wrap.innerHTML = '';
  editTags.forEach(t => {
    const p = document.createElement('span'); p.className = 'tag-pill';
    p.innerHTML = `${esc(t)}<button class="tag-rm" onclick="removeEditTag('${t.replace(/'/g,"\\'")}')">×</button>`;
    wrap.appendChild(p);
  });
  wrap.appendChild(input);
}

// ── Add record ─────────────────────────────────────────────────────────────────
async function addRecord() {
  const animal_id = v('f-id'), species = v('f-species'), date_of_birth = v('f-dob'),
        gender = v('f-gender'), genotype = v('f-genotype'), date_of_sacrifice = v('f-sacrifice'),
        owner = v('f-owner');
  if (!animal_id || !species || !date_of_birth || !gender || !genotype || !date_of_sacrifice || !owner) {
    showMsg('add-msg', 'Please fill in all required fields (marked *).', 'danger'); return;
  }
  const samples = SAMPLE_KEYS.filter(k => document.getElementById('s-'+k).checked).map(k => SAMPLE_LABELS[k]);
  const row = {
    animal_id, species, date_of_birth, gender, genotype, date_of_sacrifice,
    litter_group: v('f-litter'), cohort: v('f-cohort'), owner,
    entered_by: v('f-enteredby') || currentUser.name,
    tags: [...currentTags], samples, notes: v('f-notes'), created_by: currentUser.name
  };
  const { error } = await supabase.from('animals').insert(row);
  if (error) { showMsg('add-msg', 'Error: ' + error.message, 'danger'); return; }

  // Save to recall
  saveToRecall({
    label: `${genotype} · ${species} · ${owner}`,
    owner, species, gender, genotype,
    litter: v('f-litter'), cohort: v('f-cohort'),
    tags: [...currentTags], samples
  });

  await logAudit('ADD_RECORD', `Added animal ${animal_id} (${genotype}, ${species})`);
  clearAddForm();
  showMsg('add-msg', `Record added: ${animal_id}`, 'success');
}

function clearAddForm() {
  ['f-id','f-genotype','f-notes','f-litter','f-cohort','f-owner'].forEach(i => document.getElementById(i).value = '');
  document.getElementById('f-enteredby').value = currentUser.name;
  document.getElementById('f-species').value = '';
  document.getElementById('f-gender').value  = '';
  document.getElementById('f-dob').value     = '';
  document.getElementById('f-sacrifice').value = '';
  SAMPLE_KEYS.forEach(k => document.getElementById('s-'+k).checked = false);
  currentTags = []; renderTagPills();
}

// ── Edit modal ─────────────────────────────────────────────────────────────────
function openEditModal(id) {
  const rec = records.find(r => r.id === id);
  if (!rec) return;

  const isOwner = rec.created_by === currentUser.name || rec.entered_by === currentUser.name || rec.owner === currentUser.name;
  const noteEl = document.getElementById('owner-note');
  const saveBtn = document.getElementById('save-edit-btn');

  if (isOwner) {
    noteEl.textContent = '✏️ You created this record — you can edit it.';
    noteEl.style.color = 'var(--success)';
    saveBtn.disabled = false;
    saveBtn.style.opacity = '1';
    // Enable all inputs
    ['e-owner','e-enteredby','e-id','e-species','e-dob','e-gender','e-genotype','e-sacrifice','e-litter','e-cohort','e-notes','e-tag-input'].forEach(id => {
      const el = document.getElementById(id); if (el) el.disabled = false;
    });
    document.querySelectorAll('#e-sample-grid input').forEach(el => el.disabled = false);
  } else {
    noteEl.textContent = '🔒 View only — only ' + (rec.created_by || rec.entered_by || rec.owner) + ' can edit this record.';
    noteEl.style.color = 'var(--text3)';
    saveBtn.disabled = true;
    saveBtn.style.opacity = '0.4';
    // Disable all inputs
    ['e-owner','e-enteredby','e-id','e-species','e-dob','e-gender','e-genotype','e-sacrifice','e-litter','e-cohort','e-notes','e-tag-input'].forEach(id => {
      const el = document.getElementById(id); if (el) el.disabled = true;
    });
    document.querySelectorAll('#e-sample-grid input').forEach(el => el.disabled = true);
  }

  // Populate fields
  document.getElementById('e-id').value         = rec.animal_id  || '';
  document.getElementById('e-species').value    = rec.species    || '';
  document.getElementById('e-dob').value        = rec.date_of_birth || '';
  document.getElementById('e-gender').value     = rec.gender     || '';
  document.getElementById('e-genotype').value   = rec.genotype   || '';
  document.getElementById('e-sacrifice').value  = rec.date_of_sacrifice || '';
  document.getElementById('e-litter').value     = rec.litter_group || '';
  document.getElementById('e-cohort').value     = rec.cohort     || '';
  document.getElementById('e-owner').value      = rec.owner      || '';
  document.getElementById('e-enteredby').value  = rec.entered_by || '';
  document.getElementById('e-notes').value      = rec.notes      || '';

  editTags = [...(rec.tags || [])];
  renderEditTagPills();

  SAMPLE_KEYS.forEach(k => {
    const el = document.getElementById('es-'+k);
    if (el) el.checked = (rec.samples || []).includes(SAMPLE_LABELS[k]);
  });

  editingId = id;
  document.getElementById('edit-modal').style.display = 'flex';
}

function closeEditModal() {
  document.getElementById('edit-modal').style.display = 'none';
  editingId = null;
  document.getElementById('edit-msg').textContent = '';
}

async function saveEdit() {
  if (!editingId) return;
  const rec = records.find(r => r.id === editingId);
  if (!rec) return;

  const animal_id = document.getElementById('e-id').value.trim();
  const owner     = document.getElementById('e-owner').value.trim();
  const genotype  = document.getElementById('e-genotype').value.trim();
  if (!animal_id || !owner || !genotype) {
    showMsg('edit-msg', 'Please fill in required fields.', 'danger'); return;
  }
  const samples = SAMPLE_KEYS.filter(k => document.getElementById('es-'+k).checked).map(k => SAMPLE_LABELS[k]);
  const updates = {
    animal_id,
    species:          document.getElementById('e-species').value,
    date_of_birth:    document.getElementById('e-dob').value,
    gender:           document.getElementById('e-gender').value,
    genotype,
    date_of_sacrifice:document.getElementById('e-sacrifice').value,
    litter_group:     document.getElementById('e-litter').value.trim(),
    cohort:           document.getElementById('e-cohort').value.trim(),
    owner,
    entered_by:       document.getElementById('e-enteredby').value.trim(),
    notes:            document.getElementById('e-notes').value.trim(),
    tags: editTags,
    samples,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase.from('animals').update(updates).eq('id', editingId);
  if (error) { showMsg('edit-msg', 'Error: ' + error.message, 'danger'); return; }

  await logAudit('EDIT_RECORD', `Edited animal ${animal_id} (${genotype})`);
  showMsg('edit-msg', 'Saved!', 'success');
  setTimeout(() => closeEditModal(), 800);
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function v(id) { return document.getElementById(id).value.trim(); }
function today() { return new Date().toISOString().slice(0,10); }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function show(id, d='block') { document.getElementById(id).style.display = d; }
function hide(id) { document.getElementById(id).style.display = 'none'; }
function showMsg(id, text, type) {
  const el = document.getElementById(id);
  el.className = 'msg ' + type;
  el.textContent = text;
  if (type === 'success') setTimeout(() => el.textContent = '', 3500);
}
function calcAge(dob, sac) {
  if (!dob || !sac) return '—';
  const d = Math.round((new Date(sac) - new Date(dob)) / 86400000);
  if (d < 0) return '?'; if (d < 28) return d + 'd'; return Math.round(d/7) + 'w';
}

// ── Stats ──────────────────────────────────────────────────────────────────────
function updateStats() {
  document.getElementById('stat-total').textContent  = records.length;
  document.getElementById('stat-mf').textContent     = records.filter(r=>r.gender==='M').length + '/' + records.filter(r=>r.gender==='F').length;
  document.getElementById('stat-gt').textContent     = new Set(records.map(r=>r.genotype).filter(Boolean)).size;
  document.getElementById('stat-owners').textContent = new Set(records.map(r=>r.owner).filter(Boolean)).size;
  const fillSel = (id, vals) => {
    const sel = document.getElementById(id), cur = sel.value;
    sel.innerHTML = '<option value="">All</option>';
    vals.forEach(v => { const o = document.createElement('option'); o.value=v; o.textContent=v; sel.appendChild(o); });
    if (cur) sel.value = cur;
  };
  fillSel('q-genotype', [...new Set(records.map(r=>r.genotype).filter(Boolean))].sort());
  fillSel('q-cohort',   [...new Set(records.map(r=>r.cohort).filter(Boolean))].sort());
  fillSel('q-owner',    [...new Set(records.map(r=>r.owner).filter(Boolean))].sort());
}

function populateAnimalSelects() {
  const ids = records.map(r => r.animal_id).sort();
  [['pn-animal','— General —'],['pn-animal-filter','All']].forEach(([sid,def]) => {
    const sel = document.getElementById(sid), cur = sel.value;
    sel.innerHTML = `<option value="">${def}</option>`;
    ids.forEach(id => { const o=document.createElement('option'); o.value=id; o.textContent=id; sel.appendChild(o); });
    if (cur) sel.value = cur;
  });
}

// ── Sort ───────────────────────────────────────────────────────────────────────
function sortBy(col) {
  sortDir = (sortCol === col) ? sortDir * -1 : 1;
  sortCol = col;
  document.querySelectorAll('#thead th').forEach(th => {
    th.classList.remove('sa','sd');
    const si = th.querySelector('.si'); if (si) si.textContent = '↕';
  });
  const cols = ['animal_id','species','date_of_birth','date_of_sacrifice','','gender','genotype','litter_group','cohort','owner','entered_by'];
  const idx = cols.indexOf(col);
  if (idx >= 0) {
    const th = document.querySelectorAll('#thead th')[idx];
    th.classList.add(sortDir === 1 ? 'sa' : 'sd');
    const si = th.querySelector('.si'); if (si) si.textContent = sortDir === 1 ? '↑' : '↓';
  }
  renderTable();
}

// ── Filter ─────────────────────────────────────────────────────────────────────
function getFiltered() {
  const q=v('q-search').toLowerCase(), sp=v('q-species'), gn=v('q-gender'),
        gt=v('q-genotype'), co=v('q-cohort'), ow=v('q-owner'), sm=v('q-sample'),
        sf=document.getElementById('q-sac-from').value,
        st=document.getElementById('q-sac-to').value;
  return records.filter(r => {
    if (sp && r.species !== sp) return false;
    if (gn && r.gender  !== gn) return false;
    if (gt && r.genotype!== gt) return false;
    if (co && r.cohort  !== co) return false;
    if (ow && r.owner   !== ow) return false;
    if (sm && !(r.samples||[]).includes(sm)) return false;
    if (sf && r.date_of_sacrifice && r.date_of_sacrifice < sf) return false;
    if (st && r.date_of_sacrifice && r.date_of_sacrifice > st) return false;
    if (q) {
      const h=[r.animal_id,r.genotype,r.notes,r.species,r.cohort,r.litter_group,r.owner,r.entered_by,...(r.tags||[])].join(' ').toLowerCase();
      if (!h.includes(q)) return false;
    }
    return true;
  });
}

// ── Table ──────────────────────────────────────────────────────────────────────
function renderTable() {
  let filtered = getFiltered();
  if (sortCol) filtered = [...filtered].sort((a,b) => {
    const av=a[sortCol]||'', bv=b[sortCol]||'';
    return av<bv ? -sortDir : av>bv ? sortDir : 0;
  });
  const tbody=document.getElementById('tbody'), empty=document.getElementById('empty-msg');
  if (!filtered.length) { tbody.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display='none';
  tbody.innerHTML = filtered.map(r => {
    const badge = r.gender==='M'?'<span class="badge badge-m">M</span>':r.gender==='F'?'<span class="badge badge-f">F</span>':'<span class="badge badge-u">U</span>';
    const chips = (r.samples||[]).length ? r.samples.map(s=>`<span class="chip">${esc(s)}</span>`).join('') : '<span style="color:var(--text3);font-size:11px;">—</span>';
    const tags  = (r.tags||[]).length ? r.tags.map(t=>`<span class="chip chip-cohort">${esc(t)}</span>`).join('') : '';
    const canEdit = r.created_by===currentUser.name || r.entered_by===currentUser.name || r.owner===currentUser.name;
    const editBtn = `<button class="btn-edit" onclick="openEditModal('${r.id}')" title="${canEdit?'Edit record':'View record (read-only)'}">${canEdit?'✏️':'👁'}</button>`;
    return `<tr>
      <td style="font-weight:500;white-space:nowrap;">${esc(r.animal_id)}</td>
      <td>${esc(r.species)}</td>
      <td style="white-space:nowrap;">${r.date_of_birth||'—'}</td>
      <td style="white-space:nowrap;">${r.date_of_sacrifice||'—'}</td>
      <td style="color:var(--text2);">${calcAge(r.date_of_birth,r.date_of_sacrifice)}</td>
      <td>${badge}</td>
      <td style="font-style:italic;">${esc(r.genotype)||'—'}</td>
      <td>${r.litter_group?`<span class="chip chip-group">${esc(r.litter_group)}</span>`:'—'}</td>
      <td>${r.cohort?`<span class="chip chip-cohort">${esc(r.cohort)}</span>`:'—'}</td>
      <td>${r.owner?`<span class="chip chip-owner">${esc(r.owner)}</span>`:'—'}</td>
      <td>${r.entered_by?`<span class="chip chip-entry">${esc(r.entered_by)}</span>`:'—'}</td>
      <td style="max-width:120px;">${tags}</td>
      <td style="max-width:180px;">${chips}</td>
      <td style="color:var(--text2);max-width:130px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${esc(r.notes||'')}">${esc(r.notes||'')}</td>
      <td style="white-space:nowrap;">${editBtn}<button class="btn-del" onclick="deleteRecord('${r.id}')" title="Delete">×</button></td>
    </tr>`;
  }).join('');
}

async function deleteRecord(id) {
  const rec = records.find(r => r.id === id);
  if (!confirm(`Delete record for ${rec?.animal_id}?`)) return;
  const { error } = await supabase.from('animals').delete().eq('id', id);
  if (error) { alert('Error: ' + error.message); return; }
  await logAudit('DELETE_RECORD', `Deleted animal ${rec?.animal_id} (${rec?.genotype})`);
}

// ── CSV Export/Import ──────────────────────────────────────────────────────────
function exportCSV() {
  const filtered = getFiltered();
  const hdr = ['Animal ID','Species','Date of Birth','Date of Sacrifice','Age','Gender','Genotype','Litter','Cohort','Owner','Entered By','Tags','Samples','Notes'];
  const rows = filtered.map(r => [
    r.animal_id,r.species,r.date_of_birth,r.date_of_sacrifice,calcAge(r.date_of_birth,r.date_of_sacrifice),
    r.gender==='M'?'Male':r.gender==='F'?'Female':'Unknown',r.genotype,r.litter_group||'',r.cohort||'',
    r.owner||'',r.entered_by||'',(r.tags||[]).join('; '),(r.samples||[]).join('; '),r.notes||''
  ].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(','));
  dlCSV([hdr.join(','),...rows].join('\n'),'animal_registry_export.csv');
}
function dlCSV(content,name){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8;'}));a.download=name;a.click();URL.revokeObjectURL(a.href);}
function downloadTemplate(){
  const h='Animal ID,Species,Date of Birth,Date of Sacrifice,Gender (M/F/U),Genotype,Litter,Cohort,Tags (;-sep),Samples (;-sep),Notes,Owner,Entered By';
  const e='M-2024-001,Mouse,2024-01-10,2024-04-10,M,WT,L1,Exp-01,control,Brain; Liver; Blood,Healthy control,Dr. Müller,A. Schmidt';
  dlCSV(h+'\n'+e,'animal_registry_template.csv');
}
function handleFileSelect(e){if(e.target.files[0])readCSVFile(e.target.files[0]);}
function handleDrop(e){e.preventDefault();document.getElementById('drop-zone').classList.remove('drag');if(e.dataTransfer.files[0])readCSVFile(e.dataTransfer.files[0]);}
function readCSVFile(f){const r=new FileReader();r.onload=e=>processCSV(e.target.result);r.readAsText(f);}
function processCSV(text){
  const parsed=parseCSV(text);
  const existing=new Set(records.map(r=>r.animal_id));
  const dupes=parsed.filter(r=>existing.has(r.animal_id));
  const fresh=parsed.filter(r=>!existing.has(r.animal_id));
  const prev=document.getElementById('import-preview');
  prev.style.display='block';
  prev.textContent=`Parsed ${parsed.length} rows → ${fresh.length} new, ${dupes.length} duplicate (skipped)\n\nPreview:\n`+fresh.slice(0,3).map(r=>`  ${r.animal_id} | ${r.species} | ${r.genotype}`).join('\n');
  document.getElementById('import-actions').style.display='flex';
  pendingImport=fresh;
}
function parseCSV(text){
  const lines=text.trim().split(/\r?\n/);if(lines.length<2)return[];
  return lines.slice(1).map(line=>{
    const cols=csvSplit(line);
    const[animal_id,species,date_of_birth,date_of_sacrifice,gender,genotype,litter_group,cohort,tagsR,samplesR,notes,owner,entered_by]=cols;
    if(!animal_id)return null;
    return{animal_id,species:species||'',date_of_birth:date_of_birth||'',date_of_sacrifice:date_of_sacrifice||'',
      gender:(gender||'').toUpperCase().trim(),genotype:genotype||'',litter_group:litter_group||'',cohort:cohort||'',
      tags:tagsR?tagsR.split(';').map(t=>t.trim()).filter(Boolean):[],
      samples:samplesR?samplesR.split(';').map(s=>s.trim()).filter(Boolean):[],
      notes:notes||'',owner:owner||'',entered_by:entered_by||currentUser.name,created_by:currentUser.name};
  }).filter(Boolean);
}
function csvSplit(line){const cols=[];let cur='',inQ=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'&&!inQ)inQ=true;else if(ch==='"'&&inQ&&line[i+1]==='"'){cur+='"';i++;}else if(ch==='"'&&inQ)inQ=false;else if(ch===','&&!inQ){cols.push(cur.trim());cur='';}else cur+=ch;}cols.push(cur.trim());return cols;}
async function confirmImport(){
  if(!pendingImport.length){showMsg('import-msg','Nothing to import.','danger');return;}
  const{error}=await supabase.from('animals').insert(pendingImport);
  if(error){showMsg('import-msg','Error: '+error.message,'danger');return;}
  await logAudit('BULK_IMPORT',`Imported ${pendingImport.length} records`);
  showMsg('import-msg',`Imported ${pendingImport.length} records.`,'success');
  pendingImport=[];document.getElementById('import-preview').style.display='none';document.getElementById('import-actions').style.display='none';document.getElementById('csv-file').value='';
}
function cancelImport(){pendingImport=[];document.getElementById('import-preview').style.display='none';document.getElementById('import-actions').style.display='none';document.getElementById('csv-file').value='';}

// ── Charts ─────────────────────────────────────────────────────────────────────
function groupRecords(key){const m={};records.forEach(r=>{const k=r[key]||'(none)';if(!m[k])m[k]=[];m[k].push(r);});return Object.entries(m).sort((a,b)=>b[1].length-a[1].length);}
function renderCharts(){
  const key=document.getElementById('chart-groupby').value;
  const label={genotype:'Genotype',cohort:'Cohort / Experiment',owner:'Owner',species:'Species',litter_group:'Litter / Group'}[key];
  document.getElementById('ch1-title').textContent=`Animals by ${label.toLowerCase()}`;
  document.getElementById('ch2-title').textContent=`Sample availability by ${label.toLowerCase()}`;
  const grp=groupRecords(key),maxV=grp.length&&grp[0][1].length?grp[0][1].length:1;
  renderBarChart('ch-animals',grp,maxV);renderGenderDonut();renderSampleHeatmap(key);
  const og=groupRecords('owner');renderBarChart('ch-owners',og,og.length?(og[0][1].length||1):1);renderTimeline();
}
function renderBarChart(cid,entries,maxVal){
  const el=document.getElementById(cid);
  if(!entries.length){el.innerHTML='<div class="empty" style="padding:1.5rem;">No data yet.</div>';return;}
  el.innerHTML=entries.map(([label,items],i)=>`<div class="bar-row"><div class="bar-label" title="${esc(label)}">${esc(label)}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.round(items.length/maxVal*100)}%;background:${CHART_COLORS[i%CHART_COLORS.length]};"></div></div><div class="bar-count">${items.length}</div></div>`).join('');
}
function renderGenderDonut(){
  const el=document.getElementById('ch-gender');
  const m=records.filter(r=>r.gender==='M').length,f=records.filter(r=>r.gender==='F').length,u=records.filter(r=>r.gender==='U').length,total=records.length;
  if(!total){el.innerHTML='<div class="empty" style="padding:1.5rem;">No data.</div>';return;}
  const slices=[{label:'Male',val:m,col:'#185FA5'},{label:'Female',val:f,col:'#993556'},{label:'Unknown',val:u,col:'#888780'}].filter(s=>s.val>0);
  let ang=-Math.PI/2;const R=50,cx=62,cy=62,sz=124;
  const paths=slices.map(s=>{const a=(s.val/total)*2*Math.PI,x1=cx+R*Math.cos(ang),y1=cy+R*Math.sin(ang),x2=cx+R*Math.cos(ang+a),y2=cy+R*Math.sin(ang+a),lg=a>Math.PI?1:0;ang+=a;return`<path d="M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 ${lg} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${s.col}"/>`;}).join('');
  el.innerHTML=`<svg width="${sz}" height="${sz}" viewBox="0 0 ${sz} ${sz}" style="flex-shrink:0;"><circle cx="${cx}" cy="${cy}" r="${R}" fill="var(--bg2)"/>${paths}<circle cx="${cx}" cy="${cy}" r="28" fill="var(--bg)"/><text x="${cx}" y="${cy-4}" text-anchor="middle" font-size="16" font-weight="500" fill="var(--text)" font-family="monospace">${total}</text><text x="${cx}" y="${cy+13}" text-anchor="middle" font-size="9" fill="var(--text2)" font-family="monospace">total</text></svg><div>${slices.map(s=>`<div class="legend-row"><div class="legend-dot" style="background:${s.col}"></div>${s.label}: ${s.val} (${Math.round(s.val/total*100)}%)</div>`).join('')}</div>`;
}
function renderSampleHeatmap(gk){
  const el=document.getElementById('ch-samples'),groups=groupRecords(gk).slice(0,14);
  const active=ALL_SAMPLE_LABELS.filter(v=>records.some(r=>(r.samples||[]).includes(v)));
  if(!groups.length||!active.length){el.innerHTML='<div class="empty" style="padding:1.5rem;">No data.</div>';return;}
  const cw=Math.max(40,Math.floor(Math.min(window.innerWidth-200,900)/(groups.length+1)));
  let h=`<div style="display:grid;grid-template-columns:100px repeat(${groups.length},${cw}px);gap:3px;font-size:10px;font-family:monospace;"><div></div>`+groups.map(([g])=>`<div style="text-align:center;color:var(--text2);padding:2px 2px 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(g)}">${esc(g)}</div>`).join('');
  active.forEach(s=>{h+=`<div style="color:var(--text2);display:flex;align-items:center;justify-content:flex-end;padding-right:8px;white-space:nowrap;">${s}</div>`;groups.forEach(([,items])=>{const c=items.filter(r=>(r.samples||[]).includes(s)).length,p=items.length?c/items.length:0,a=Math.round(p*200).toString(16).padStart(2,'0');h+=`<div style="background:${c>0?`#534AB7${a}`:'var(--bg2)'};border-radius:2px;display:flex;align-items:center;justify-content:center;font-size:10px;color:${p>0.5?'#fff':'var(--text2)'};min-height:20px;">${c>0?c:''}</div>`;});});
  el.innerHTML=h+'</div>';
}
function renderTimeline(){
  const el=document.getElementById('ch-timeline'),months={};
  records.forEach(r=>{if(!r.date_of_sacrifice)return;const m=r.date_of_sacrifice.slice(0,7);months[m]=(months[m]||0)+1;});
  const entries=Object.entries(months).sort((a,b)=>a[0]<b[0]?-1:1).slice(-14);
  if(!entries.length){el.innerHTML='<div class="empty" style="padding:1.5rem;">No sacrifice dates recorded.</div>';return;}
  const maxV=Math.max(...entries.map(e=>e[1]));
  el.innerHTML=entries.map(([m,c])=>`<div class="bar-row"><div class="bar-label">${m.slice(5)+'/'+m.slice(2,4)}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.round(c/maxV*100)}%;background:#0F6E56;"></div></div><div class="bar-count">${c}</div></div>`).join('');
}

// ── Phenotype Notes ────────────────────────────────────────────────────────────
async function addNote(){
  const body=document.getElementById('pn-body').value.trim();
  if(!body){showMsg('pn-msg','Please enter an observation.','danger');return;}
  const row={animal_id:document.getElementById('pn-animal').value||null,author:v('pn-author')||currentUser.name,category:document.getElementById('pn-category').value||'General',note_date:document.getElementById('pn-date').value||today(),body,created_by:currentUser.name};
  const{error}=await supabase.from('phenotype_notes').insert(row);
  if(error){showMsg('pn-msg','Error: '+error.message,'danger');return;}
  await logAudit('ADD_NOTE',`Added ${row.category} note${row.animal_id?' for '+row.animal_id:''}`);
  document.getElementById('pn-body').value='';document.getElementById('pn-animal').value='';document.getElementById('pn-date').value=today();document.getElementById('pn-category').value='';document.getElementById('pn-author').value=currentUser.name;
  showMsg('pn-msg','Note saved.','success');
}
function renderNotes(){
  const q=(document.getElementById('pn-search').value||'').toLowerCase(),cat=document.getElementById('pn-cat-filter').value,anim=document.getElementById('pn-animal-filter').value;
  const filtered=notes.filter(n=>{if(cat&&n.category!==cat)return false;if(anim&&n.animal_id!==anim)return false;if(q){const h=[n.body,n.author,n.animal_id,n.category].join(' ').toLowerCase();if(!h.includes(q))return false;}return true;});
  const list=document.getElementById('notes-list'),empty=document.getElementById('pn-empty');
  if(!filtered.length){list.innerHTML='';empty.style.display='block';return;}
  empty.style.display='none';
  list.innerHTML=filtered.map(n=>`<div class="note-card"><div class="note-hdr"><div><span style="font-size:13px;font-weight:500;">${esc(n.category)}</span>${n.animal_id?`<span style="margin-left:8px;" class="chip chip-entry">${esc(n.animal_id)}</span>`:''}<div class="note-meta">${n.note_date}${n.author?' · '+esc(n.author):''}</div></div><button class="btn-del" onclick="deleteNote('${n.id}')">×</button></div><div class="note-body">${esc(n.body)}</div></div>`).join('');
}
async function deleteNote(id){if(!confirm('Delete this note?'))return;const{error}=await supabase.from('phenotype_notes').delete().eq('id',id);if(error){alert('Error: '+error.message);return;}await logAudit('DELETE_NOTE','Deleted a phenotype note');}

// ── Audit Log ──────────────────────────────────────────────────────────────────
function renderAudit(){
  const q=(document.getElementById('audit-search').value||'').toLowerCase(),user=document.getElementById('audit-user-filter').value;
  const users=[...new Set(auditLog.map(a=>a.user_name).filter(Boolean))].sort();
  const uf=document.getElementById('audit-user-filter'),cur=uf.value;
  uf.innerHTML='<option value="">All users</option>';
  users.forEach(u=>{const o=document.createElement('option');o.value=u;o.textContent=u;uf.appendChild(o);});
  if(cur)uf.value=cur;
  const filtered=auditLog.filter(a=>{if(user&&a.user_name!==user)return false;if(q){const h=[a.user_name,a.action,a.detail].join(' ').toLowerCase();if(!h.includes(q))return false;}return true;});
  const list=document.getElementById('audit-list'),empty=document.getElementById('audit-empty');
  if(!filtered.length){list.innerHTML='';empty.style.display='block';return;}
  empty.style.display='none';
  const labels={ADD_RECORD:'Added record',EDIT_RECORD:'Edited record',DELETE_RECORD:'Deleted record',BULK_IMPORT:'Bulk import',ADD_NOTE:'Added note',DELETE_NOTE:'Deleted note'};
  list.innerHTML=filtered.map(a=>{
    const dt=new Date(a.created_at);
    const ts=dt.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'})+' '+dt.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
    return`<div class="audit-row"><span class="audit-time">${ts}</span><span class="audit-user">${esc(a.user_name||'?')}</span><span class="audit-action"><strong>${labels[a.action]||a.action}</strong> — ${esc(a.detail||'')}</span></div>`;
  }).join('');
}
