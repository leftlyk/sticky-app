(function() {
  const btn = document.getElementById('record-btn');
  const pop = document.getElementById('listen-popover');
  if (!btn || !pop) return;

  function fmtAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  }

  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  async function getRecent() {
    try {
      const s = await fetch('/api/state').then(r => r.json());
      const list = s.listening || [];
      return list.slice().sort((a, b) => b.ts - a.ts).slice(0, 6);
    } catch { return []; }
  }

  async function open() {
    pop.innerHTML = '';

    const lab = document.createElement('div');
    lab.className = 'label';
    lab.textContent = 'now listening to…';
    pop.appendChild(lab);

    const input = document.createElement('input');
    input.className = 'listen-input';
    input.placeholder = 'song · artist · album';
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'off');
    pop.appendChild(input);

    const sug = document.createElement('div');
    sug.className = 'listen-sugs';
    pop.appendChild(sug);

    let acController = null;
    let acTimer = null;
    let acIndex = -1;
    let acItems = [];

    function renderSugs() {
      sug.innerHTML = '';
      if (!acItems.length) return;
      for (let i = 0; i < acItems.length; i++) {
        const it = acItems[i];
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'sug';
        if (i === acIndex) row.classList.add('active');
        if (it.artworkUrl60) {
          const img = document.createElement('img');
          img.src = it.artworkUrl60;
          img.alt = '';
          row.appendChild(img);
        }
        const meta = document.createElement('span');
        meta.className = 'sug-meta';
        const t = document.createElement('span');
        t.className = 'sug-track';
        t.textContent = it.trackName || '(untitled)';
        const a = document.createElement('span');
        a.className = 'sug-artist';
        a.textContent = it.artistName || '';
        meta.appendChild(t);
        meta.appendChild(a);
        row.appendChild(meta);
        row.addEventListener('mousedown', e => {
          e.preventDefault();
          input.value = `${it.trackName} · ${it.artistName}`;
          acItems = []; renderSugs();
          submit();
        });
        sug.appendChild(row);
      }
    }

    async function fetchSugs(q) {
      if (acController) acController.abort();
      acController = new AbortController();
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=6`;
      try {
        const r = await fetch(url, { signal: acController.signal });
        const data = await r.json();
        acItems = (data.results || []).slice(0, 6);
        acIndex = -1;
        renderSugs();
      } catch (e) {
        if (e.name !== 'AbortError') { acItems = []; renderSugs(); }
      }
    }

    input.addEventListener('input', () => {
      const q = input.value.trim();
      if (acTimer) clearTimeout(acTimer);
      if (q.length < 2) { acItems = []; renderSugs(); return; }
      acTimer = setTimeout(() => fetchSugs(q), 250);
    });

    const foot = document.createElement('div');
    foot.className = 'listen-foot';
    const save = document.createElement('button');
    save.className = 'listen-save';
    save.textContent = 'save';
    foot.appendChild(save);
    const hint = document.createElement('span');
    hint.textContent = '⏎ save · esc close';
    foot.appendChild(hint);
    pop.appendChild(foot);

    const recent = document.createElement('div');
    recent.className = 'listen-recent';
    pop.appendChild(recent);

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = '♪ saved';
    pop.appendChild(toast);

    async function refresh() {
      const list = await getRecent();
      recent.innerHTML = '';
      if (!list.length) { recent.textContent = 'no entries yet'; return; }
      for (const e of list) {
        const row = document.createElement('div');
        row.className = 'row';
        const when = document.createElement('span');
        when.className = 'when';
        when.textContent = fmtAgo(e.ts);
        when.title = fmtTime(e.ts);
        const txt = document.createElement('span');
        txt.textContent = e.text;
        row.appendChild(when);
        row.appendChild(txt);
        recent.appendChild(row);
      }
    }

    async function submit() {
      const text = input.value.trim();
      if (!text) return;
      save.disabled = true;
      try {
        await fetch('/api/listening', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        btn.classList.add('recording');
        setTimeout(() => btn.classList.remove('recording'), 1200);
        input.value = '';
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 1000);
        await refresh();
        if (typeof window.onListeningSaved === 'function') window.onListeningSaved();
      } finally {
        save.disabled = false;
        input.focus();
      }
    }

    save.addEventListener('click', submit);
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' && acItems.length) {
        e.preventDefault();
        acIndex = (acIndex + 1) % acItems.length;
        renderSugs();
        return;
      }
      if (e.key === 'ArrowUp' && acItems.length) {
        e.preventDefault();
        acIndex = (acIndex - 1 + acItems.length) % acItems.length;
        renderSugs();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (acIndex >= 0 && acItems[acIndex]) {
          const it = acItems[acIndex];
          input.value = `${it.trackName} · ${it.artistName}`;
          acItems = []; renderSugs();
        }
        submit();
        return;
      }
      if (e.key === 'Escape') {
        if (acItems.length) { acItems = []; renderSugs(); }
        else close();
      }
    });

    pop.classList.remove('hidden');
    const r = btn.getBoundingClientRect();
    pop.style.left = `${Math.max(8, r.left)}px`;
    pop.style.top = `${r.bottom + 10}px`;
    setTimeout(() => input.focus(), 30);
    refresh();
  }

  function close() { pop.classList.add('hidden'); pop.innerHTML = ''; }

  btn.addEventListener('click', e => {
    e.stopPropagation();
    if (pop.classList.contains('hidden')) open(); else close();
  });

  document.addEventListener('mousedown', e => {
    if (pop.classList.contains('hidden')) return;
    if (pop.contains(e.target) || e.target.closest('#record-btn')) return;
    close();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !pop.classList.contains('hidden')) close();
  });
})();
