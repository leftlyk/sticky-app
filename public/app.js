const COLORS = ['--p-yellow','--p-pink','--p-blue','--p-green','--p-peach','--p-lilac','--p-mint','--p-cream'];
const EFFORTS = ['XS', 'S', 'M', 'L', 'XL'];

const state = { notes: [], categories: [], showArchive: false };
const els = { board: document.getElementById('board'), popover: document.getElementById('popover'), tpl: document.getElementById('note-tpl') };
const timerEls = new Map();
const tapeRot = new Map();

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

// FLIP helper: captures positions of every note, runs the mutation, then
// animates siblings from their old position to their new one. The dragged
// note is skipped — user already released it where they want it.
function flipMove(mutate, skipEl) {
  const notes = [...document.querySelectorAll('.note')];
  const before = new Map();
  for (const el of notes) before.set(el, el.getBoundingClientRect());
  mutate();
  for (const el of notes) {
    if (el === skipEl) continue;
    if (!el.isConnected) continue;
    const a = before.get(el);
    const b = el.getBoundingClientRect();
    const dx = a.left - b.left;
    const dy = a.top - b.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    const rot = el.style.getPropertyValue('--rot') || '0deg';
    el.style.transition = 'none';
    el.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot})`;
  }
  requestAnimationFrame(() => {
    for (const el of notes) {
      if (el === skipEl) continue;
      if (!el.isConnected) continue;
      el.style.transition = '';
      el.style.transform = '';
    }
  });
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
  timerEls.clear();
  for (const col of document.querySelectorAll('.col-body')) col.innerHTML = '';
  const sorted = [...visibleNotes()].sort((a, b) => (a.order || 0) - (b.order || 0));
  for (const n of sorted) {
    const container = document.querySelector(`.col-body[data-drop="${n.status}"]`);
    if (container) container.appendChild(buildNote(n));
  }
  renderArchiveBanner();
  renderVersionMarker();
  updateCounts();
}

let cachedVersion = null;
async function renderVersionMarker() {
  const done = document.querySelector('.col-body[data-drop="done"]');
  if (!done) return;
  if (cachedVersion === null) {
    try {
      cachedVersion = window.__TAURI__?.app?.getVersion ? await window.__TAURI__.app.getVersion() : '';
    } catch { cachedVersion = ''; }
  }
  if (!cachedVersion) return;
  const marker = document.createElement('div');
  marker.className = 'version-marker';
  marker.textContent = `v${cachedVersion}`;
  done.appendChild(marker);
}

function buildNote(n) {
  const el = els.tpl.content.firstElementChild.cloneNode(true);
  el.dataset.id = n.id;
  el.style.background = `var(${n.color || '--p-yellow'})`;
  el.style.setProperty('--rot', `${n.rotation || 0}deg`);
  if (!tapeRot.has(n.id)) tapeRot.set(n.id, -3 + (Math.random() * 6 - 3));
  el.style.setProperty('--tape-rot', `${tapeRot.get(n.id)}deg`);

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
  timerEls.set(n.id, timer);

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
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      body.blur();
    }
    if (e.key === 'Escape') body.blur();
  });
  // Strip formatting on paste — sticky notes only hold plain text.
  body.addEventListener('paste', e => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData)?.getData('text/plain') ?? '';
    document.execCommand('insertText', false, text);
  });
  // Suppress focus/selection on initial mousedown so the parent's pointer
  // drag can take over. We re-focus manually on pointerup if it was a click.
  body.addEventListener('mousedown', e => {
    if (document.activeElement !== body) e.preventDefault();
  });

  el.querySelector('.del').addEventListener('click', async e => {
    e.stopPropagation();
    el.style.transition = 'transform 220ms, opacity 220ms';
    el.style.transform += ' scale(0.3)';
    el.style.opacity = '0';
    await api(`/api/notes/${n.id}`, { method: 'DELETE' });
    state.notes = state.notes.filter(x => x.id !== n.id);
    timerEls.delete(n.id);
    tapeRot.delete(n.id);
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

  attachPointerDrag(el, n);
}

// Pointer-based drag: avoids WKWebView's HTML5 drag-image return animation
// (the ~100ms snap on drop) and gives us full control of the dragged ghost.
// Strategy:
//   1. pointerdown remembers the start point. We don't activate drag until
//      the pointer moves past a 4px threshold — clicks still work normally.
//   2. On activation, we create a placeholder div that takes the note's slot
//      in the flex column, then detach the note to <body> with position:fixed
//      so we can transform it freely without affecting layout.
//   3. On pointermove, we translate the note to follow the pointer. We also
//      hit-test the column under the pointer and reposition the placeholder
//      with FLIP, so other notes slide rather than pop.
//   4. On pointerup, we re-insert the note where the placeholder is, then
//      animate the note from its dragged transform back to identity.
//   5. PATCH fires after the visual snap so the UI never waits on disk I/O.
function attachPointerDrag(el, n) {
  const body = el.querySelector('.note-body');

  el.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    if (e.target.closest('.chip, .del, button, input')) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const onBody = !!e.target.closest('.note-body');
    const bodyFocused = document.activeElement === body;
    // If the user is mid-edit, let the browser's native caret/selection
    // behaviour run; we'll only intercept once the gesture turns into a drag.
    const allowNativeText = onBody && bodyFocused;
    let active = false;
    let placeholder = null;
    let originRect = null;
    let scrollParent = null;
    let scrollAtStart = 0;
    let currentCol = el.closest('.column');
    let currentBefore = el.nextElementSibling && el.nextElementSibling.classList?.contains('note') ? el.nextElementSibling : null;

    if (!allowNativeText) e.preventDefault();

    const onMove = ev => {
      if (!active) {
        const dx = Math.abs(ev.clientX - startX);
        const dy = Math.abs(ev.clientY - startY);
        if (dx < 4 && dy < 4) return;
        active = true;
        // If we let native text select start, kill it now that we know this
        // is a drag gesture instead of a text selection.
        if (allowNativeText) {
          body.blur();
          window.getSelection()?.removeAllRanges();
        }
        startDrag();
      }
      doDrag(ev);
    };

    const cleanup = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
    };

    const onUp = ev => {
      cleanup();
      if (active) {
        finishDrag(ev);
      } else if (onBody && document.activeElement !== body) {
        body.focus();
        const range = document.caretRangeFromPoint?.(ev.clientX, ev.clientY);
        if (range) {
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    };

    const onCancel = () => {
      cleanup();
      if (active) snapBack();
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);

    function startDrag() {
      // kill any in-flight create animation so it doesn't override our transform
      el.classList.remove('ghost-in');

      originRect = el.getBoundingClientRect();
      scrollParent = el.closest('.col-body');
      scrollAtStart = scrollParent ? scrollParent.scrollTop : 0;

      placeholder = document.createElement('div');
      placeholder.className = 'note-placeholder';
      placeholder.style.cssText = `width: ${originRect.width}px; height: ${originRect.height}px; flex-shrink: 0;`;
      el.parentNode.insertBefore(placeholder, el);

      el.classList.add('dragging');
      el.style.position = 'fixed';
      el.style.left = `${originRect.left}px`;
      el.style.top = `${originRect.top}px`;
      el.style.width = `${originRect.width}px`;
      el.style.zIndex = '1000';
      el.style.pointerEvents = 'none';
      document.body.appendChild(el);
    }

    function doDrag(ev) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const rot = el.style.getPropertyValue('--rot') || '0deg';
      el.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot})`;

      const target = document.elementFromPoint(ev.clientX, ev.clientY);
      const col = target?.closest('.column');

      // dragover styling
      for (const c of document.querySelectorAll('.column.drag-over')) {
        if (c !== col) c.classList.remove('drag-over');
      }

      if (!col) return;
      col.classList.add('drag-over');
      const colBody = col.querySelector('.col-body');

      const siblings = [...colBody.querySelectorAll('.note:not(.dragging)')];
      let newBefore = null;
      for (const s of siblings) {
        const r = s.getBoundingClientRect();
        if (ev.clientY < r.top + r.height / 2) { newBefore = s; break; }
      }

      if (col === currentCol && newBefore === currentBefore) return;

      flipMove(() => {
        if (newBefore) colBody.insertBefore(placeholder, newBefore);
        else colBody.appendChild(placeholder);
      }, el);

      currentCol = col;
      currentBefore = newBefore;
    }

    function finishDrag(ev) {
      for (const c of document.querySelectorAll('.column.drag-over')) c.classList.remove('drag-over');

      if (!currentCol || !placeholder?.parentNode) {
        snapBack();
        return;
      }

      const colBody = currentCol.querySelector('.col-body');
      const status = currentCol.dataset.status;

      // siblings BEFORE the swap, for order math
      const siblings = [...colBody.querySelectorAll('.note')];
      const placeholderIdx = siblings.indexOf(placeholder);
      const beforeNote = siblings[placeholderIdx + 1]?.classList.contains('note') ? siblings[placeholderIdx + 1] : null;
      const afterNote = placeholderIdx > 0 ? siblings[placeholderIdx - 1] : null;
      const beforeOrder = beforeNote ? state.notes.find(x => x.id === beforeNote.dataset.id)?.order : null;
      const afterOrder = afterNote ? state.notes.find(x => x.id === afterNote.dataset.id)?.order : null;

      let newOrder;
      if (beforeOrder != null && afterOrder != null) newOrder = (beforeOrder + afterOrder) / 2;
      else if (beforeOrder != null) newOrder = beforeOrder - 1;
      else if (afterOrder != null) newOrder = afterOrder + 1;
      else newOrder = Date.now();

      n.order = newOrder;
      n.status = status;

      // pointer position relative to viewport when the drop happens
      const ptrLeft = originRect.left + (ev.clientX - startX);
      const ptrTop = originRect.top + (ev.clientY - startY);

      // re-insert el where the placeholder is and reset positioning
      placeholder.parentNode.insertBefore(el, placeholder);
      placeholder.remove();
      el.style.position = '';
      el.style.left = '';
      el.style.top = '';
      el.style.width = '';
      el.style.zIndex = '';
      el.style.pointerEvents = '';

      if (status === 'doing') el.classList.add('running');
      else el.classList.remove('running');

      // No snap animation — siblings already FLIP-slid into place during the
      // drag, so the note just lands at its slot. Avoids any post-drop wiggle.
      el.classList.remove('dragging');
      el.style.transition = 'none';
      el.style.transform = '';
      void el.offsetWidth;
      el.style.transition = '';

      api(`/api/notes/${n.id}`, { method: 'PATCH', body: { status, order: newOrder } }).then(updated => {
        Object.assign(n, updated);
        const t = timerEls.get(n.id);
        if (t) t.textContent = fmtElapsed(noteElapsedMs(n));
        updateCounts();
      });
    }

    function snapBack() {
      if (!placeholder) return;
      placeholder.parentNode?.insertBefore(el, placeholder);
      placeholder.remove();
      el.style.position = '';
      el.style.left = '';
      el.style.top = '';
      el.style.width = '';
      el.style.zIndex = '';
      el.style.pointerEvents = '';
      el.style.transition = '';
      el.style.transform = '';
      el.classList.remove('dragging');
      for (const c of document.querySelectorAll('.column.drag-over')) c.classList.remove('drag-over');
    }
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
  input.spellcheck = false;
  input.autocomplete = 'off';
  input.setAttribute('autocorrect', 'off');
  input.setAttribute('autocapitalize', 'off');
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

// panel double-click to add
for (const col of document.querySelectorAll('.column')) {
  const status = col.dataset.status;
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
    const el = timerEls.get(n.id);
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
