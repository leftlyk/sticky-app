// Tauri storage shim. No-op in browser (web dev) so server.js handles /api/*.
// In desktop: intercepts /api/* fetches and routes them through Rust commands
// `load_data` / `save_data`. All business logic stays here in JS.
(function () {
  if (!window.__TAURI__) return;

  const invoke = window.__TAURI__.core.invoke;
  const realFetch = window.fetch.bind(window);

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  async function loadJson() {
    const s = await invoke('load_data');
    const d = JSON.parse(s);
    if (!d.notes) d.notes = [];
    if (!d.categories) d.categories = ['work', 'life', 'idea'];
    if (!d.listening) d.listening = [];
    return d;
  }

  async function saveJson(data) {
    await invoke('save_data', { json: JSON.stringify(data, null, 2) });
  }

  function jsonResponse(obj, status) {
    return new Response(JSON.stringify(obj), {
      status: status || 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async function handle(url, opts) {
    const method = (opts && opts.method) || 'GET';
    const body = opts && opts.body ? JSON.parse(opts.body) : {};
    const data = await loadJson();

    if (url === '/api/state' && method === 'GET') {
      return jsonResponse(data);
    }

    if (url === '/api/notes' && method === 'POST') {
      const now = Date.now();
      const note = {
        id: uid(),
        text: body.text || '',
        status: body.status || 'todo',
        category: body.category || null,
        effort: body.effort || null,
        color: body.color,
        rotation: body.rotation == null ? Math.random() * 6 - 3 : body.rotation,
        createdAt: now,
        startedAt: body.status === 'doing' ? now : null,
        completedAt: body.status === 'done' ? now : null,
        elapsedMs: 0,
        order: body.order == null ? now : body.order,
      };
      data.notes.push(note);
      await saveJson(data);
      return jsonResponse(note);
    }

    const noteMatch = url.match(/^\/api\/notes\/([^/]+)$/);
    if (noteMatch) {
      const id = noteMatch[1];
      const idx = data.notes.findIndex(n => n.id === id);
      if (idx < 0) return jsonResponse({ error: 'not found' }, 404);

      if (method === 'PATCH') {
        const note = data.notes[idx];
        const now = Date.now();
        if (body.status && body.status !== note.status) {
          if (note.status === 'doing' && note.startedAt) {
            note.elapsedMs = (note.elapsedMs || 0) + (now - note.startedAt);
            note.startedAt = null;
          }
          if (body.status === 'doing') note.startedAt = now;
          if (body.status === 'done') note.completedAt = now;
          if (body.status !== 'done') note.completedAt = null;
          note.status = body.status;
          if (body.status !== 'done') note.archived = false;
        }
        for (const k of ['text', 'category', 'effort', 'color', 'rotation', 'order', 'archived']) {
          if (k in body) note[k] = body[k];
        }
        await saveJson(data);
        return jsonResponse(note);
      }

      if (method === 'DELETE') {
        data.notes.splice(idx, 1);
        await saveJson(data);
        return jsonResponse({ ok: true });
      }
    }

    if (url === '/api/listening' && method === 'POST') {
      const text = (body.text || '').trim();
      if (!text) return jsonResponse({ error: 'empty' }, 400);
      const entry = { id: uid(), text: text, ts: Date.now() };
      data.listening.push(entry);
      await saveJson(data);
      return jsonResponse(entry);
    }

    if (url === '/api/archive-done' && method === 'POST') {
      let n = 0;
      for (const note of data.notes) {
        if (note.status === 'done' && !note.archived) { note.archived = true; n++; }
      }
      await saveJson(data);
      return jsonResponse({ archived: n });
    }

    if (url === '/api/categories' && method === 'POST') {
      const name = (body.name || '').trim().toLowerCase();
      if (name && data.categories.indexOf(name) === -1) data.categories.push(name);
      await saveJson(data);
      return jsonResponse(data.categories);
    }

    return jsonResponse({ error: 'not found' }, 404);
  }

  window.fetch = function (url, opts) {
    if (typeof url === 'string' && url.indexOf('/api/') === 0) {
      return handle(url, opts || {});
    }
    return realFetch(url, opts);
  };
})();
