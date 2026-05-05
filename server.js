const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 5174;
const DATA_FILE = path.join(__dirname, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

function loadData() {
  try {
    const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (!d.listening) d.listening = [];
    return d;
  } catch {
    return { notes: [], categories: ['work', 'life', 'idea'], listening: [] };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res) {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, urlPath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end('forbidden'); return;
  }
  fs.readFile(filePath, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(buf);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch(e) { reject(e); } });
    req.on('error', reject);
  });
}

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];

  if (!url.startsWith('/api/')) return serveStatic(req, res);

  const data = loadData();

  try {
    if (url === '/api/state' && req.method === 'GET') {
      return json(res, 200, data);
    }

    if (url === '/api/notes' && req.method === 'POST') {
      const body = await readBody(req);
      const now = Date.now();
      const note = {
        id: uid(),
        text: body.text || '',
        status: body.status || 'todo',
        category: body.category || null,
        effort: body.effort || null,
        color: body.color,
        rotation: body.rotation ?? (Math.random() * 6 - 3),
        createdAt: now,
        startedAt: body.status === 'doing' ? now : null,
        completedAt: body.status === 'done' ? now : null,
        elapsedMs: 0,
        order: body.order ?? now,
      };
      data.notes.push(note);
      saveData(data);
      return json(res, 200, note);
    }

    const noteMatch = url.match(/^\/api\/notes\/([^/]+)$/);
    if (noteMatch) {
      const id = noteMatch[1];
      const idx = data.notes.findIndex(n => n.id === id);
      if (idx < 0) return json(res, 404, { error: 'not found' });

      if (req.method === 'PATCH') {
        const body = await readBody(req);
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
        saveData(data);
        return json(res, 200, note);
      }

      if (req.method === 'DELETE') {
        data.notes.splice(idx, 1);
        saveData(data);
        return json(res, 200, { ok: true });
      }
    }

    if (url === '/api/listening' && req.method === 'POST') {
      const body = await readBody(req);
      const text = (body.text || '').trim();
      if (!text) return json(res, 400, { error: 'empty' });
      const entry = { id: uid(), text, ts: Date.now() };
      data.listening.push(entry);
      saveData(data);
      return json(res, 200, entry);
    }

    if (url === '/api/archive-done' && req.method === 'POST') {
      let n = 0;
      for (const note of data.notes) {
        if (note.status === 'done' && !note.archived) { note.archived = true; n++; }
      }
      saveData(data);
      return json(res, 200, { archived: n });
    }

    if (url === '/api/categories' && req.method === 'POST') {
      const body = await readBody(req);
      const name = (body.name || '').trim().toLowerCase();
      if (name && !data.categories.includes(name)) {
        data.categories.push(name);
        saveData(data);
      }
      return json(res, 200, data.categories);
    }

    return json(res, 404, { error: 'not found' });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`sticky notes running → http://localhost:${PORT}`);
});
