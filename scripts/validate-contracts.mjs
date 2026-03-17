import fs from 'node:fs';
import path from 'node:path';

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

function fail(msg) {
  console.error(`contracts:validate: FAIL: ${msg}`);
  process.exitCode = 1;
}

function ok(msg) {
  console.log(`contracts:validate: OK: ${msg}`);
}

function findRepoRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 8; i++) {
    const contractsDir = path.join(dir, 'contracts');
    if (fs.existsSync(contractsDir) && fs.statSync(contractsDir).isDirectory()) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

const repoRoot = findRepoRoot(process.cwd());

function unique(arr) {
  return Array.from(new Set(arr));
}

function parseWranglerBindings(tomlText) {
  const out = [];
  const re = /^\s*binding\s*=\s*"([^"]+)"\s*$/gm;
  let m;
  while ((m = re.exec(tomlText))) out.push(m[1]);
  return unique(out);
}

function extractTsInterfaceBody(tsText, interfaceName) {
  const idx = tsText.indexOf(`interface ${interfaceName}`);
  if (idx === -1) return null;
  const braceStart = tsText.indexOf('{', idx);
  if (braceStart === -1) return null;
  let depth = 0;
  for (let i = braceStart; i < tsText.length; i++) {
    const ch = tsText[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return tsText.slice(braceStart + 1, i);
    }
  }
  return null;
}

function extractBraceBlockAfter(text, needle) {
  const idx = text.indexOf(needle);
  if (idx === -1) return null;
  const braceStart = text.indexOf('{', idx);
  if (braceStart === -1) return null;
  let depth = 0;
  for (let i = braceStart; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(braceStart + 1, i);
    }
  }
  return null;
}

function parseTsInterfaceFields(tsText, interfaceName) {
  const body = extractTsInterfaceBody(tsText, interfaceName);
  if (!body) return [];
  const out = [];
  const re = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*\??\s*:\s*/gm;
  let m;
  while ((m = re.exec(body))) out.push(m[1]);
  return unique(out);
}

function parseStoreNamesFromDbTs(dbText) {
  // Pull string literal values from `export enum StoreNames { ... }`
  const body = extractBraceBlockAfter(dbText, 'export enum StoreNames') ?? '';
  const out = [];
  const re = /['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(body))) out.push(m[1]);
  return unique(out);
}

// -------- Worker bindings / vars --------
const workerBindingsContract = path.join(repoRoot, 'contracts', 'WORKER_BINDINGS.md');
const wranglerToml = path.join(repoRoot, 'cloudflare-workers', 'wrangler.toml');
const workerTypes = path.join(repoRoot, 'cloudflare-workers', 'shared', 'types.ts');

const REQUIRED_VARS_OR_SECRETS = [
  'AUTH_SECRET',
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'GITHUB_OWNER',
  'FRONTEND_URL',
  'WORKER_URL',
];

const REQUIRED_RESOURCE_BINDINGS = [
  'ANALYTICS_DB',
  'USER_PREFERENCES_DB',
  'USER_CONTENT_R2',
  'BACKUP_R2',
  'ANALYTICS_ENGINE',
  'ANALYTICS_QUEUE',
  'PROGRESS_KV',
];

const RECOMMENDED_RESOURCE_BINDINGS = ['DECODER_KV', 'AI_CACHE_KV'];

const contractText = read(workerBindingsContract);
for (const name of [...REQUIRED_VARS_OR_SECRETS, ...REQUIRED_RESOURCE_BINDINGS, ...RECOMMENDED_RESOURCE_BINDINGS]) {
  if (!contractText.includes('`' + name + '`')) fail(`WORKER_BINDINGS.md missing \`${name}\``);
}
ok('WORKER_BINDINGS.md contains required names');

const wranglerText = read(wranglerToml);
const wranglerBindings = new Set(parseWranglerBindings(wranglerText));
for (const name of [...REQUIRED_RESOURCE_BINDINGS, ...RECOMMENDED_RESOURCE_BINDINGS]) {
  if (!wranglerBindings.has(name)) fail(`wrangler.toml missing binding "${name}"`);
}
ok('wrangler.toml contains required resource bindings');

const typesText = read(workerTypes);
const workerEnvFields = new Set(parseTsInterfaceFields(typesText, 'WorkerEnv'));
for (const name of [...REQUIRED_VARS_OR_SECRETS, ...REQUIRED_RESOURCE_BINDINGS, ...RECOMMENDED_RESOURCE_BINDINGS]) {
  if (!workerEnvFields.has(name)) fail(`shared/types.ts WorkerEnv missing field ${name}`);
}
ok('shared/types.ts contains WorkerEnv fields');

// -------- IndexedDB stores --------
const idbContract = path.join(repoRoot, 'contracts', 'INDEXEDDB_STORES.md');
const dbTs = path.join(repoRoot, 'nexus-reader', 'src', 'utils', 'db.ts');

const IDB_STORES = [
  'progress',
  'syncQueue',
  'offlineContent',
  'books',
  'chapters',
  'settings',
  'cache',
];

const idbText = read(idbContract);
for (const store of IDB_STORES) {
  if (!idbText.includes('`' + store + '`')) fail(`INDEXEDDB_STORES.md missing store \`${store}\``);
}
ok('INDEXEDDB_STORES.md lists expected stores');

const dbText = read(dbTs);
const storeNames = new Set(parseStoreNamesFromDbTs(dbText));
for (const store of IDB_STORES) {
  if (!storeNames.has(store)) fail(`db.ts StoreNames missing "${store}"`);
}
ok('db.ts references expected store names');

// -------- Progress API contract --------
const progressContract = path.join(repoRoot, 'contracts', 'PROGRESS_API.md');
const workerUnified = path.join(repoRoot, 'cloudflare-workers', 'unified-worker.ts');

const progressText = read(progressContract);
const workerText = read(workerUnified);

for (const s of ['PUT /progress/:bookId', 'GET /progress/:bookId', 'DELETE /progress/:bookId', 'updatedAt']) {
  if (!progressText.includes(s)) fail(`PROGRESS_API.md missing "${s}"`);
}
ok('PROGRESS_API.md includes required method docs');

// Check Worker handler implements required methods and updatedAt semantics.
const requiredWorkerSnippets = [
  'async function handleProgressSync',
  "if (request.method === 'GET')",
  "if (request.method === 'DELETE')",
  "request.method !== 'PUT'",
  'updatedAt: Date.now()',
  "headers: { ...getCorsHeaders(), 'Content-Type': 'application/json' }",
];
for (const snippet of requiredWorkerSnippets) {
  if (!workerText.includes(snippet)) fail(`unified-worker.ts missing progress API snippet: ${snippet}`);
}
ok('unified-worker.ts implements Progress API (basic checks)');

// -------- Client routing analytics endpoint --------
const requiredClientRoutingSnippets = [
  "case '/api/analytics/client-routing'",
  'async function handleClientRoutingAnalytics',
  "FROM analytics_metrics",
  "index1 = 'client_metrics'",
  "blob2 = 'api_route'",
  "blob2 = 'api_response_ms'",
];
for (const snippet of requiredClientRoutingSnippets) {
  if (!workerText.includes(snippet)) fail(`unified-worker.ts missing client-routing analytics snippet: ${snippet}`);
}
ok('unified-worker.ts includes client-routing analytics query constraints');

if (!process.exitCode) {
  console.log('contracts:validate: PASS');
}

