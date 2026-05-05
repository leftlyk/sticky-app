const COLORS = ['--p-yellow','--p-pink','--p-blue','--p-green','--p-peach','--p-lilac','--p-mint','--p-cream'];
const EFFORTS = ['XS', 'S', 'M', 'L', 'XL'];

const state = { notes: [], categories: [], showArchive: false };
const els = { board: document.getElementById('board'), popover: document.getElementById('popover'), tpl: document.getElementById('note-tpl') };

function api(url, opts = {}) {
  return fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  }).then(r => r.json());
}

async function load() {
  const data = await fetch('/api/state').then(r => r.json());
  state.notes = data.notes || [];
  state.categories = data.categories || [];
  render();
}

function pickColor() { return COLORS[Math.floor(Math.random() * COLORS.length)]; }

function fmtElapsed(ms) {
  if (!ms || ms < 0) return '⏱ 0m';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `⏱ ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `⏱ ${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `⏱ ${h}h ${rem}m` : `⏱ ${h}h`;
}

function noteElapsedMs(n) {
  let ms = n.elapsedMs || 0;
  if (n.status === 'doing' && n.startedAt) ms += Date.now() - n.startedAt;
  return ms;
}

function visibleNotes() {
  return state.notes.filter(n => {
    if (!n.archived) return true;
    return n.status === 'done' && state.showArchive;
  });
}

function updateCounts() {
  const counts = { todo: 0, doing: 0, done: 0 };
  for (const n of visibleNotes()) counts[n.status] = (counts[n.status] || 0) + 1;
  for (const k of Object.keys(counts)) {
    const el = document.querySelector(`.count[data-count="${k}"]`);
    if (el) el.textContent = counts[k] ? `· ${counts[k]}` : '';
  }
}

function renderArchiveBanner() {
  const body = document.querySelector('.col-body[data-drop="done"]');
  const existing = body.querySelector('.archive-banner');
  if (existing) existing.remove();
  if (!state.showArchive) return;
  const archivedCount = state.notes.filter(n => n.status === 'done' && n.archived).length;
  const banner = document.createElement('div');
  banner.className = 'archive-banner';
  banner.textContent = `viewing archive · ${archivedCount} archived`;
  body.prepend(banner);
}

function render() {
  for (const col of document.querySelectorAll('.col-body')) col.innerHTML = '';
  const sorted = [...visibleNotes()].sort((a, b) => (a.order || 0) - (b.order || 0));
  for (const n of sorted) {
    const container = document.querySelector(`.col-body[data-drop="${n.status}"]`);
    if (container) container.appendChild(buildNote(n));
  }
  renderArchiveBanner();
  updateCounts();
}

function buildNote(n) {
  const el = els.tpl.content.firstElementChild.cloneNode(true);
  el.dataset.id = n.id;
  el.style.background = `var(${n.color || '--p-yellow'})`;
  el.style.setProperty('--rot', `${n.rotation || 0}deg`);
  el.style.transform = `rotate(${n.rotation || 0}deg)`;
  el.style.setProperty('--tape-rot', `${-3 + (Math.random() * 6 - 3)}deg`);

  if (n.status === 'doing') el.classList.add('running');
  if (n.archived) el.classList.add('archived');

  const body = el.querySelector('.note-body');
  body.textContent = n.text || '';

  const catChip = el.querySelector('.cat-chip');
  catChip.textContent = n.category || '+ tag';
  if (!n.category) catChip.classList.add('empty');

  const effChip = el.querySelector('.eff-chip');
  effChip.textContent = n.effort ? `● ${n.effort}` : '+ effort';
  if (!n.effort) effChip.classList.add('empty');

  const timer = el.querySelector('.timer');
  timer.textContent = fmtElapsed(noteElapsedMs(n));

  bindNote(el, n);
  return el;
}

function bindNote(el, n) {
  const body = el.querySelector('.note-body');

  body.addEventListener('blur', () => {
    const text = body.textContent.trim();
    if (text === (n.text || '').trim()) return;
    n.text = text;
    api(`/api/notes/${n.id}`, { method: 'PATCH', body: { text } });
  });
  body.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); body.blur(); }
    if (e.key === 'Escape') body.blur();
  });
  body.addEventListener('mousedown', e => e.stopPropagation());

  el.querySelector('.del').addEventListener('click', async e => {
    e.stopPropagation();
    el.style.transition = 'transform 220ms, opacity 220ms';
    el.style.transform += ' scale(0.3)';
    el.style.opacity = '0';
    await api(`/api/notes/${n.id}`, { method: 'DELETE' });
    state.notes = state.notes.filter(x => x.id !== n.id);
    setTimeout(() => { el.remove(); updateCounts(); }, 220);
  });

  el.querySelector('.cat-chip').addEventListener('click', e => {
    e.stopPropagation();
    openCategoryPopover(e.currentTarget, n, el);
  });
  el.querySelector('.eff-chip').addEventListener('click', e => {
    e.stopPropagation();
    openEffortPopover(e.currentTarget, n, el);
  });

  // drag
  el.addEventListener('dragstart', e => {
    el.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', n.id);
  });
  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
    document.querySelectorAll('.column.drag-over').forEach(c => c.classList.remove('drag-over'));
  });
}

function openCategoryPopover(anchor, n, el) {
  const p = els.popover;
  p.innerHTML = '';
  const lab = document.createElement('div'); lab.className = 'label'; lab.textContent = 'category';
  const row = document.createElement('div'); row.className = 'row';
  for (const c of state.categories) {
    const b = document.createElement('button');
    b.textContent = c;
    if (n.category === c) b.classList.add('active');
    b.onclick = async () => {
      const newVal = n.category === c ? null : c;
      n.category = newVal;
      await api(`/api/notes/${n.id}`, { method: 'PATCH', body: { category: newVal } });
      updateChips(el, n);
      closePopover();
    };
    row.appendChild(b);
  }
  const clear = document.createElement('button');
  clear.textContent = 'clear';
  clear.onclick = async () => {
    n.category = null;
    await api(`/api/notes/${n.id}`, { method: 'PATCH', body: { category: null } });
    updateChips(el, n);
    closePopover();
  };
  row.appendChild(clear);

  const newRow = document.createElement('div'); newRow.className = 'row';
  const input = document.createElement('input');
  input.placeholder = 'new category…';
  input.onkeydown = async e => {
    if (e.key === 'Enter' && input.value.trim()) {
      const cats = await api('/api/categories', { method: 'POST', body: { name: input.value.trim() } });
      state.categories = cats;
      const name = input.value.trim().toLowerCase();
      n.category = name;
      await api(`/api/notes/${n.id}`, { method: 'PATCH', body: { category: name } });
      updateChips(el, n);
      closePopover();
    }
  };
  newRow.appendChild(input);

  p.appendChild(lab); p.appendChild(row); p.appendChild(newRow);
  positionPopover(anchor);
}

function openEffortPopover(anchor, n, el) {
  const p = els.popover;
  p.innerHTML = '';
  const lab = document.createElement('div'); lab.className = 'label'; lab.textContent = 'effort';
  const row = document.createElement('div'); row.className = 'row';
  for (const e of EFFORTS) {
    const b = document.createElement('button');
    b.textContent = e;
    if (n.effort === e) b.classList.add('active');
    b.onclick = async () => {
      const newVal = n.effort === e ? null : e;
      n.effort = newVal;
      await api(`/api/notes/${n.id}`, { method: 'PATCH', body: { effort: newVal } });
      updateChips(el, n);
      closePopover();
    };
    row.appendChild(b);
  }
  p.appendChild(lab); p.appendChild(row);
  positionPopover(anchor);
}

function positionPopover(anchor) {
  const p = els.popover;
  p.classList.remove('hidden');
  const r = anchor.getBoundingClientRect();
  const pw = p.offsetWidth, ph = p.offsetHeight;
  let left = r.left;
  let top = r.bottom + 6;
  if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
  if (top + ph > window.innerHeight - 8) top = r.top - ph - 6;
  p.style.left = `${left}px`;
  p.style.top = `${top}px`;
}

function closePopover() { els.popover.classList.add('hidden'); }

document.addEventListener('mousedown', e => {
  if (!els.popover.contains(e.target) && !e.target.closest('.chip')) closePopover();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePopover(); });

function updateChips(el, n) {
  const c = el.querySelector('.cat-chip');
  c.textContent = n.category || '+ tag';
  c.classList.toggle('empty', !n.category);
  const eff = el.querySelector('.eff-chip');
  eff.textContent = n.effort ? `● ${n.effort}` : '+ effort';
  eff.classList.toggle('empty', !n.effort);
}

// panel drop zones
for (const col of document.querySelectorAll('.column')) {
  const body = col.querySelector('.col-body');
  const status = col.dataset.status;

  col.addEventListener('dragover', e => {
    e.preventDefault();
    col.classList.add('drag-over');
    e.dataTransfer.dropEffect = 'move';
  });
  col.addEventListener('dragleave', e => {
    if (!col.contains(e.relatedTarget)) col.classList.remove('drag-over');
  });
  col.addEventListener('drop', async e => {
    e.preventDefault();
    col.classList.remove('drag-over');
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    const n = state.notes.find(x => x.id === id);
    if (!n) return;

    // compute drop position
    const siblings = [...body.querySelectorAll('.note:not(.dragging)')];
    const y = e.clientY;
    let before = null;
    for (const s of siblings) {
      const r = s.getBoundingClientRect();
      if (y < r.top + r.height / 2) { before = s; break; }
    }

    // update local
    const prevStatus = n.status;
    n.status = status;

    // determine new order based on neighbors
    const beforeOrder = before ? state.notes.find(x => x.id === before.dataset.id)?.order ?? Date.now() : null;
    const nextIdx = siblings.indexOf(before);
    const afterEl = nextIdx <= 0 ? siblings[siblings.length - 1] : siblings[nextIdx - 1];
    const afterOrder = afterEl && afterEl !== before ? state.notes.find(x => x.id === afterEl.dataset.id)?.order ?? 0 : 0;

    let newOrder;
    if (before && afterEl && afterEl !== before) newOrder = (beforeOrder + afterOrder) / 2;
    else if (before) newOrder = beforeOrder - 1;
    else newOrder = Date.now();
    n.order = newOrder;

    // dom move
    const el = document.querySelector(`.note[data-id="${id}"]`);
    if (el) {
      if (before) body.insertBefore(el, before); else body.appendChild(el);
      if (status === 'doing') el.classList.add('running'); else el.classList.remove('running');
    }

    const updated = await api(`/api/notes/${n.id}`, { method: 'PATCH', body: { status, order: newOrder } });
    Object.assign(n, updated);
    const freshEl = document.querySelector(`.note[data-id="${n.id}"]`);
    if (freshEl) freshEl.querySelector('.timer').textContent = fmtElapsed(noteElapsedMs(n));
    updateCounts();
  });

  // dbl-click empty area → add
  col.addEventListener('dblclick', e => {
    if (e.target.closest('.note')) return;
    if (e.target.closest('.add-btn')) return;
    createNote(status);
  });
}

// + buttons
for (const btn of document.querySelectorAll('.add-btn')) {
  btn.addEventListener('click', () => createNote(btn.dataset.add));
}

document.getElementById('archive-done').addEventListener('click', async () => {
  const visibleDone = state.notes.filter(n => n.status === 'done' && !n.archived);
  if (!visibleDone.length) return;
  await fetch('/api/archive-done', { method: 'POST' });
  for (const n of visibleDone) n.archived = true;
  render();
});

document.getElementById('view-archive').addEventListener('click', e => {
  state.showArchive = !state.showArchive;
  e.currentTarget.classList.toggle('active', state.showArchive);
  e.currentTarget.title = state.showArchive ? 'hide archive' : 'visit archive';
  render();
});

async function createNote(status) {
  const rotation = Math.random() * 6 - 3;
  const color = pickColor();
  const created = await api('/api/notes', { method: 'POST', body: { status, color, rotation } });
  state.notes.push(created);
  const el = buildNote(created);
  el.classList.add('ghost-in');
  document.querySelector(`.col-body[data-drop="${status}"]`).appendChild(el);
  updateCounts();
  setTimeout(() => {
    el.classList.remove('ghost-in');
    el.querySelector('.note-body').focus();
  }, 240);
}

// live timer tick
setInterval(() => {
  for (const n of state.notes) {
    if (n.status !== 'doing') continue;
    const el = document.querySelector(`.note[data-id="${n.id}"] .timer`);
    if (el) el.textContent = fmtElapsed(noteElapsedMs(n));
  }
}, 1000);

// global keyboard
document.addEventListener('keydown', e => {
  if (e.key === 'n' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    createNote('todo');
  }
});

load();
