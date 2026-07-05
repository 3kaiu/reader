// Node.js worker for executing translated Legado sources.
// Provides runtime helpers: __fetch, __parseHTML, __cookieStore, __ctx, CF bypass.
// JSON-RPC over stdin/stdout.

const readline = require('readline');
const path = require('path');
const { JSDOM } = require('jsdom');

const SOURCES_DIR = process.env.SOURCES_DIR || './api/sources/generated';
const BYPASS_URL = process.env.BYPASS_URL || 'http://localhost:8000';
const BYPASS_API_KEY = process.env.BYPASS_API_KEY || '';

// ─── Cookie Cache (per-domain, with TTL) ────────────────────────────────
const cookieCache = new Map(); // domain → { cookies, expiresAt }

function getCachedCookies(domain) {
  const entry = cookieCache.get(domain);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cookieCache.delete(domain);
    return null;
  }
  return entry.cookies;
}

function setCachedCookies(domain, cookies, ttlMs = 25 * 60 * 1000) {
  cookieCache.set(domain, {
    cookies,
    expiresAt: Date.now() + ttlMs,
  });
  // Evict oldest if cache grows too large
  if (cookieCache.size > 100) {
    const first = cookieCache.keys().next().value;
    cookieCache.delete(first);
  }
}

// ─── CF Detection ────────────────────────────────────────────────────────
const CF_MARKERS = [
  'Just a moment', 'cf-browser-verification', 'Checking your browser',
  'cf-challenge-running', 'cf-turnstile-wrapper', 'challenge-platform',
  '正在进行安全验证',
];

function isCFBlocked(html) {
  if (!html || html.length < 200) return true;
  const lower = html.toLowerCase();
  return CF_MARKERS.some(m => lower.includes(m.toLowerCase()));
}

function extractDomain(url) {
  return url.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
}

// ─── Runtime Helpers (injected into each source execution) ───────────────

// __ctx: per-source context (persists across calls for the same source)
const ctxStore = new Map(); // sourceId → { variable, store, loginInfo, html }

function getCtx(sourceId) {
  if (!ctxStore.has(sourceId)) {
    ctxStore.set(sourceId, { variable: null, store: {}, loginInfo: {}, html: '' });
  }
  return ctxStore.get(sourceId);
}

// __cookieStore: per-domain cookie store
const cookieStore = {
  get: (url) => {
    const domain = extractDomain(url);
    return getCachedCookies(domain) || {};
  },
  delete: (url) => {
    const domain = extractDomain(url);
    cookieCache.delete(domain);
  },
};

// __fetch: HTTP request with CF bypass
async function __fetch(url, options = {}) {
  const domain = extractDomain(url);
  const headers = options.headers || {};
  const encoding = options.encoding || 'utf-8';

  // Add cached CF cookies
  const cached = getCachedCookies(domain);
  if (cached) {
    const cookieStr = Object.entries(cached).map(([k, v]) => `${k}=${v}`).join('; ');
    headers['Cookie'] = cookieStr;
  }

  // Make the HTTP request
  let response;
  try {
    response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body,
      signal: AbortSignal.timeout(30000),
    });
  } catch (e) {
    // Network error — try CF bypass
    const cfResult = await solveCF(domain, url);
    if (cfResult.ok) {
      return cfResult.html;
    }
    throw new Error(`fetch failed: ${e.message}`);
  }

  let html = await response.text();

  // Handle encoding
  if (encoding === 'gbk') {
    const buf = Buffer.from(html, 'binary');
    const { decode } = require('iconv-lite');
    html = decode(buf, 'gbk');
  }

  // Detect CF
  if (isCFBlocked(html)) {
    const cfResult = await solveCF(domain, url);
    if (cfResult.ok) {
      // Retry with cookies
      const cookieStr = Object.entries(cfResult.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
      const retryResp = await fetch(url, {
        method: options.method || 'GET',
        headers: { ...headers, Cookie: cookieStr },
        body: options.body,
      });
      return await retryResp.text();
    }
    // Return needs-verification signal as a special object
    // The worker wrapper will detect this and return it to the Rust server
    return JSON.stringify({ _needsBrowser: true, url });
  }

  return html;
}

// __fetch_with_options: for compound URLs with method/body/encoding
async function __fetch_with_options(url, options) {
  return __fetch(url, options);
}

// CF solving via Python bypass service
async function solveCF(domain, url) {
  console.error(`[cf] solving CF for ${domain}...`);

  // Check cache again (race condition guard)
  const cached = getCachedCookies(domain);
  if (cached) return { ok: true, html: '', cookies: cached };

  try {
    const resp = await fetch(`${BYPASS_URL}/api/solve-cf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(BYPASS_API_KEY ? { 'X-API-Key': BYPASS_API_KEY } : {}),
      },
      body: JSON.stringify({ url, timeout_ms: 30000 }),
      signal: AbortSignal.timeout(35000),
    });

    const result = await resp.json();
    if (result.ok && result.cookies) {
      setCachedCookies(domain, result.cookies);
      console.error(`[cf] solved for ${domain}`);
      return { ok: true, html: result.html || '', cookies: result.cookies };
    }

    console.error(`[cf] failed for ${domain}: ${result.error}`);
    return { ok: false, html: '', cookies: {} };
  } catch (e) {
    console.error(`[cf] error for ${domain}: ${e.message}`);
    return { ok: false, html: '', cookies: {} };
  }
}

// __parseHTML: DOM parsing
function __parseHTML(html) {
  const dom = new JSDOM(html);
  return dom.window.document;
}

// __queryAll: CSS selector query
function __queryAll(doc, selector) {
  return Array.from(doc.querySelectorAll(selector));
}

// __browserRender: render page in browser
async function __browserRender(url, jsCode) {
  console.error(`[browser] rendering ${url}...`);
  const resp = await fetch(`${BYPASS_URL}/api/browser-probe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(BYPASS_API_KEY ? { 'X-API-Key': BYPASS_API_KEY } : {}),
    },
    body: JSON.stringify({ url, js_code: jsCode, wait_until: 'networkidle' }),
    signal: AbortSignal.timeout(30000),
  });
  const result = await resp.json();
  return result.html || '';
}

// __browserInteraction: browser interaction (for startBrowserAwait)
async function __browserInteraction(url, title) {
  console.error(`[browser] interaction needed: ${url}`);
  const resp = await fetch(`${BYPASS_URL}/api/browser-probe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(BYPASS_API_KEY ? { 'X-API-Key': BYPASS_API_KEY } : {}),
    },
    body: JSON.stringify({ url, wait_until: 'networkidle', visible: true, poll_cf: true }),
    signal: AbortSignal.timeout(60000),
  });
  const result = await resp.json();

  // Cache cookies from the browser session
  if (result.cookies) {
    const domain = extractDomain(url);
    setCachedCookies(domain, result.cookies);
  }

  return result.html || '';
}

// __resolveUrl: resolve relative URLs
function __resolveUrl(url, base) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const baseUrl = base.replace(/\/+$/, '');
  return `${baseUrl}/${url.replace(/^\/+/, '')}`;
}

// ─── Module Cache ───────────────────────────────────────────────────────
const moduleCache = new Map();

// ─── JSON-RPC ───────────────────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });

rl.on('line', async (line) => {
  let request;
  try { request = JSON.parse(line); } catch (e) { writeError(null, `invalid JSON: ${e.message}`); return; }

  const { id, method, params } = request;
  if (!id || !method || !params) { writeError(id, 'missing id/method/params'); return; }

  try {
    const result = await executeMethod(method, params);
    writeResult(id, result);
  } catch (e) {
    writeError(id, e.message || String(e));
  }
});

async function executeMethod(method, params) {
  const { sourceId } = params;
  if (!sourceId) throw new Error('missing sourceId');

  const mod = await loadSource(sourceId);
  if (!mod) throw new Error(`source not found: ${sourceId}`);

  // Inject runtime helpers into a global context for this source
  const ctx = getCtx(sourceId);
  const globalCtx = {
    __fetch, __fetch_with_options, __parseHTML, __queryAll,
    __browserRender, __browserInteraction, __resolveUrl,
    __cookieStore: cookieStore, __ctx: ctx,
    BASE: mod.BASE || '',
    HEADERS: mod.HEADERS || {},
    document: null,
  };

  // Make runtime helpers available to the module
  // (the module uses them as globals)
  const savedGlobals = {};
  for (const [key, val] of Object.entries(globalCtx)) {
    savedGlobals[key] = globalThis[key];
    globalThis[key] = val;
  }

  try {
    switch (method) {
      case 'search': {
        const items = await mod.search(params.keyword || '', params.page || 1);
        return normalizeSearchResults(items);
      }
      case 'bookInfo': {
        const info = await mod.bookInfo(params.bookUrl);
        return normalizeBookInfo(info);
      }
      case 'chapterList': {
        const chapters = await mod.chapterList(params.tocUrl);
        return normalizeChapters(chapters);
      }
      case 'chapterContent': {
        const content = await mod.chapterContent(params.chapterUrl);
        return content;
      }
      default:
        throw new Error(`unknown method: ${method}`);
    }
  } finally {
    // Restore globals
    for (const [key, val] of Object.entries(savedGlobals)) {
      globalThis[key] = val;
    }
  }
}

async function loadSource(sourceId) {
  if (moduleCache.has(sourceId)) return moduleCache.get(sourceId);

  const sourcePath = path.join(SOURCES_DIR, `${sourceId}.js`);
  try {
    const mod = require(sourcePath);
    moduleCache.set(sourceId, mod);
    if (moduleCache.size > 500) {
      const firstKey = moduleCache.keys().next().value;
      moduleCache.delete(firstKey);
    }
    return mod;
  } catch (e) {
    console.error(`Failed to load source ${sourceId}: ${e.message}`);
    return null;
  }
}

function normalizeSearchResults(items) {
  if (!items || !Array.isArray(items)) return [];
  return items.map(item => ({
    name: item.name || '',
    author: item.author || null,
    coverUrl: item.coverUrl || null,
    bookUrl: item.bookUrl || '',
    intro: item.intro || null,
    sourceId: item.sourceId || '',
    sourceName: item.sourceName || '',
    latestChapter: item.latestChapter || null,
  }));
}

function normalizeBookInfo(info) {
  if (!info) return {};
  return {
    name: info.name || '',
    author: info.author || null,
    coverUrl: info.coverUrl || null,
    bookUrl: info.bookUrl || '',
    intro: info.intro || null,
    tocUrl: info.tocUrl || null,
    latestChapter: info.latestChapter || null,
  };
}

function normalizeChapters(chapters) {
  if (!chapters || !Array.isArray(chapters)) return [];
  return chapters.map(ch => ({
    title: ch.name || ch.title || '',
    url: ch.url || '',
    index: ch.index != null ? ch.index : 0,
    isVip: ch.isVip || false,
    wordCount: ch.wordCount || null,
  }));
}

function writeResult(id, result) {
  process.stdout.write(JSON.stringify({ id, result }) + '\n');
}

function writeError(id, message) {
  process.stdout.write(JSON.stringify({ id, error: { message } }) + '\n');
}

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));