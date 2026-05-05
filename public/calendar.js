const state = { notes: [], listening: [], view: new Date(), sticky: false };
const popover = document.getElementById('popover');
let hoverHideTimer = null;

function fmtElapsed(ms) {
  if (!ms || ms < 0) return '0m';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function fmtDate(d) {
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];

async function load() {
  const data = await fetch('/api/state').then(r => r.json());
  state.notes = (data.notes || []).filter(n => n.status === 'done' && n.completedAt);
  state.listening = data.listening || [];
  render();
}

window.onListeningSaved = load;

function bucketByDay(notes) {
  const map = new Map();
  for (const n of notes) {
    const k = dayKey(n.completedAt);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(n);
  }
  for (const arr of map.values()) arr.sort((a, b) => a.completedAt - b.completedAt);
  return map;
}

function lastListeningByDay() {
  const map = new Map();
  for (const e of state.listening) {
    const k = dayKey(e.ts);
    const cur = map.get(k);
    if (!cur || e.ts > cur.ts) map.set(k, e);
  }
  return map;
}

function recordSvg() {
  return `<svg class="disc" viewBox="0 0 40 40" aria-hidden="true">
    <circle cx="20" cy="20" r="18" fill="#1a1a1a" stroke="#2b2b2b" stroke-width="1.2"/>
    <circle cx="20" cy="20" r="14" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="0.4"/>
    <circle cx="20" cy="20" r="10" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="0.4"/>
    <circle cx="20" cy="20" r="6" fill="#D97757"/>
    <line x1="20" y1="14.5" x2="20" y2="16" stroke="rgba(0,0,0,0.45)" stroke-width="0.6" stroke-linecap="round"/>
    <circle cx="20" cy="20" r="1" fill="#1a1a1a"/>
  </svg>`;
}

function render() {
  const view = state.view;
  const year = view.getFullYear();
  const month = view.getMonth();
  document.getElementById('month-label').textContent = `${MONTHS[month]} ${year}`;

  const firstOfMonth = new Date(year, month, 1);
  const startDow = firstOfMonth.getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const buckets = bucketByDay(state.notes);
  const tunes = lastListeningByDay();

  // count this-month completions
  let monthCount = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const k = `${year}-${month}-${d}`;
    if (buckets.has(k)) monthCount += buckets.get(k).length;
  }
  document.getElementById('cal-summary').textContent =
    monthCount ? `· ${monthCount} completed this month` : '· nothing yet this month';

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  const todayKey = dayKey(Date.now());

  // leading blanks
  for (let i = 0; i < startDow; i++) {
    const blank = document.createElement('div');
    blank.className = 'cal-cell blank';
    grid.appendChild(blank);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const cell = document.createElement('div');
    cell.className = 'cal-cell';
    const k = `${year}-${month}-${d}`;
    if (k === todayKey) cell.classList.add('today');

    const num = document.createElement('div');
    num.className = 'cal-num';
    num.textContent = d;
    cell.appendChild(num);

    const tune = tunes.get(k);
    if (tune) {
      const widget = document.createElement('div');
      widget.className = 'day-record';
      widget.title = tune.text;
      widget.innerHTML = `${recordSvg()}<span class="track-name">${tune.text.replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]))}</span>`;
      cell.appendChild(widget);
    }

    const tasks = buckets.get(k) || [];
    if (tasks.length) {
      const sq = document.createElement('div');
      sq.className = 'cal-squares';
      sq.style.setProperty('--n', tasks.length);
      for (const t of tasks) {
        const b = document.createElement('button');
        b.className = 'mini';
        b.style.background = `var(${t.color || '--p-yellow'})`;
        b.title = t.text || '(no text)';
        b.addEventListener('click', e => {
          e.stopPropagation();
          state.sticky = true;
          openTaskPopover(b, t);
        });
        b.addEventListener('mouseenter', () => {
          if (hoverHideTimer) { clearTimeout(hoverHideTimer); hoverHideTimer = null; }
          if (state.sticky) return;
          openTaskPopover(b, t);
        });
        b.addEventListener('mouseleave', () => {
          if (state.sticky) return;
          hoverHideTimer = setTimeout(() => closePopover(), 120);
        });
        sq.appendChild(b);
      }
      cell.appendChild(sq);
    }

    grid.appendChild(cell);
  }
}

function openTaskPopover(anchor, t) {
  popover.innerHTML = '';
  popover.classList.add('task-pop');

  const swatch = document.createElement('div');
  swatch.className = 'pop-swatch';
  swatch.style.background = `var(${t.color || '--p-yellow'})`;
  popover.appendChild(swatch);

  const txt = document.createElement('div');
  txt.className = 'pop-text';
  txt.textContent = t.text || '(no text)';
  popover.appendChild(txt);

  const meta = document.createElement('div');
  meta.className = 'pop-meta';
  const bits = [];
  if (t.category) bits.push(`#${t.category}`);
  if (t.effort) bits.push(`${t.effort} effort`);
  bits.push(`⏱ ${fmtElapsed(t.elapsedMs)}`);
  bits.push(fmtTime(t.completedAt));
  meta.textContent = bits.join(' · ');
  popover.appendChild(meta);

  const date = document.createElement('div');
  date.className = 'pop-date';
  date.textContent = fmtDate(new Date(t.completedAt));
  popover.appendChild(date);

  popover.classList.remove('hidden');
  const r = anchor.getBoundingClientRect();
  const pw = popover.offsetWidth, ph = popover.offsetHeight;
  let left = r.left + r.width / 2 - pw / 2;
  let top = r.bottom + 8;
  if (left < 8) left = 8;
  if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
  if (top + ph > window.innerHeight - 8) top = r.top - ph - 8;
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
}

function closePopover() {
  popover.classList.add('hidden');
  popover.classList.remove('task-pop');
  state.sticky = false;
}
popover.addEventListener('mouseenter', () => {
  if (hoverHideTimer) { clearTimeout(hoverHideTimer); hoverHideTimer = null; }
});
popover.addEventListener('mouseleave', () => {
  if (state.sticky) return;
  hoverHideTimer = setTimeout(() => closePopover(), 120);
});
document.addEventListener('mousedown', e => {
  if (!popover.contains(e.target) && !e.target.closest('.mini')) closePopover();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closePopover();
  if (e.key === 'ArrowLeft') shift(-1);
  if (e.key === 'ArrowRight') shift(1);
});

function shift(delta) {
  state.view = new Date(state.view.getFullYear(), state.view.getMonth() + delta, 1);
  render();
}

document.getElementById('prev-month').onclick = () => shift(-1);
document.getElementById('next-month').onclick = () => shift(1);
document.getElementById('today-btn').onclick = () => { state.view = new Date(); render(); };

load();
