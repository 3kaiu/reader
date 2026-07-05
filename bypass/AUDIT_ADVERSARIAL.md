# Adversarial Audit: CF Bypass Module

Audited against 4 reverse engineering toolkits:
- **zhizhuodemao/js-reverse-mcp** (☆2.1k) — JS reverse MCP with Patchright/CloakBrowser anti-detection
- **zhaoxuya520/reverse-skill** (☆7.2k) — RE skill router with js-reverse/browser-automation skills
- **P4nda0s/reverse-skills** (☆1.5k) — Claude Code RE skills (Frida, Unicorn, IDAPython)
- **P4nda0s/IDA-NO-MCP** (☆1.7k) — IDA Pro MCP alternative

Date: 2026-07-05
Scope: `bypass/` (Python FastAPI service), `api/nexus-engine/src/fetcher/cookie_cache.rs` (Rust cookie cache)

---

## AXIS 1: Anti-Detection Audit (CRITICAL)

### Finding 1 (CRITICAL): STEALTH_JS Is Counterproductive

**Evidence**: js-reverse-mcp/anti-detection-work.en.md, Principle 1

Our `STEALTH_JS` (50 lines, 20-layer `Object.defineProperty` patches injected via `context.add_init_script()`) is the **exact anti-pattern** that js-reverse-mcp explicitly warns against:

| Detection Vector | How STEALTH_JS Triggers It |
|---|---|
| `Object.getOwnPropertyDescriptor(navigator, 'webdriver')` → sees getter/setter → bot verdict | Our `get: () => false` leaves an accessor where real Chrome has a data property |
| `Error.stack` contains `UtilityScript`/`eval at` markers | `add_init_script` executes in Playwright's isolated world; stack traces leak this |
| `Function.prototype.toString.call(navigator.webdriver)` → not `[native code]` | Overridden getter's toString is the user function body |
| `navigator.plugins.toString()` → not `[object PluginArray]` | Fake array returns `[object Array]` |
| `chrome.runtime` → getter detected by FingerprintJS | Our fake chrome object has detectable getter signatures |

**Verdict**: Our "stealth" is **making CF detection easier**, not harder. Google reCAPTCHA, FingerprintJS, and CF challenge JS specifically check for these traces and issue "unusual traffic" blocks when they appear.

### Finding 2 (CRITICAL): CDP Active During Navigation

**Evidence**: js-reverse-mcp anti-detection doc, Principle 3; our `browser_probe.py:498`

Our code calls `page.goto(url, wait_until="load", timeout=30000)` with full CDP enabled. The js-reverse-mcp explicitly:

- Defers `Network.enable` / `Debugger.enable` / `Audits.enable` until the **first non-navigation tool call**
- Reason: anti-bot scripts (CF challenges, reCAPTCHA) **probe for CDP event subscriptions during page load**. Seeing `Network.requestWillBeSent` subscriptions is an instant bot verdict.

Our approach: activate all CDP domains → navigate → hope for the best.
Better approach: navigate silently → pass risk controls → then activate CDP.

### Finding 3 (HIGH): Headless Mode Detectable

**Evidence**: js-reverse-mcp anti-detection doc, Principle 5; `browser_probe.py:45`

`BROWSER_HEADLESS_DEFAULT = True` with `--headless=new`. Headless Chromium has ~20 detectable signals even with fingerprint patches. js-reverse-mcp hardcodes `headless: false` for this reason.

The two-phase CDP method also uses `--headless=new` — same issue.

### Finding 4 (MEDIUM): Config-Level Fingerprint Hacks

**Evidence**: js-reverse-mcp anti-detection doc, Principle 2; `browser_probe.py:275-296`

Our launch args include anti-patterns:
- `--disable-gpu` — detectable GPU fingerprint mismatch
- `--lang=en-US` (implied by system) — overrides real OS locale
- Flag combinations themselves become fingerprints

js-reverse-mcp's approach: `viewport: null` (real OS dimensions), let the binary report real values. No flag-based fingerprinting.

### Finding 5 (MEDIUM): No Profile/Seed Isolation

**Evidence**: js-reverse-mcp cloaking doc; `browser_probe.py:577`

The two-phase CDP creates a fresh temp dir per solve (random identity each time), but Playwright mode reuses the same browser instance. No persistent profile means every visit looks like a first-time visitor — itself suspicious.

js-reverse-mcp persists a fingerprint seed per profile so the same identity returns to a site consistently (like a real returning user).

### Finding 6 (LOW): Known Residual Leaks

Common to ALL browser automation tools (including Patchright, Playwright, Puppeteer):

| Detection | Status | Notes |
|---|---|---|
| `chrome.runtime` | `undefined` | Chrome hides it under CDP control; no known fix at JS level |
| `chrome.app` | `undefined` | Same as above |
| `Error.stack` in evaluate() | Contains isolated world markers | Patchright/Playwright both have this; js-reverse-mcp accepts it as a known leak |

---

## AXIS 2: Architecture Audit

### Finding 7 (HIGH): No Cookie Sync Between Rust and Python

**Evidence**: `cookie_cache.rs` vs `browser_probe.py:526-528`

Rust side has a sophisticated `CookieCache`:
- IP+UA binding per entry
- Solve locks (per-domain mutex to prevent concurrent solves)
- TTL management (25 min default)

Python side gets `cf_clearance` in `_solve_cf_playwright()` and `_solve_cf_two_phase()` but:
- **Never forwards it back to Rust** — they're in separate processes
- Python cookies are returned in API response only (caller must store them)
- No shared cookie store between modules

**Impact**: Repeated CF solves per domain. Rust has valid cookies but doesn't know. Python keeps re-solving.

### Finding 8 (MEDIUM): No Circuit Breaker on Python Side

**Evidence**: `engine.py` DomainRegistry vs Rust's `FallbackChain`

Rust has per-domain circuit breakers. Python has `DomainProfile` (success/failure history) but:
- No open-circuit state (stop trying after N failures)
- No half-open state (probe after cooldown)
- No cooldown timer
- Always attempts solve regardless of recent failure rate

### Finding 9 (LOW): No Cross-Process Health Monitoring

Rust → Python communication is HTTP-only:
- No heartbeat between services
- No readiness check before forwarding requests
- If bypass service is down, Rust still tries to forward and gets connection errors
- No graceful degradation (bypass unavailable → skip CF solving → serve 403 response)

---

## AXIS 3: Performance Audit

### Finding 10 (HIGH): No Browser Warmup

**Evidence**: `browser_probe.py:260-303`

Browser is lazily initialized on first request. Cold start:
- Browser launch: 3-5s
- Context creation + stealth injection: 0.5-1s
- Page navigation: 3-10s
- CF polling: 10-30s

**Total cold solve: ~20-45s**

No `warmup()` implementation beyond launching the browser (no pre-created contexts).

### Finding 11 (MEDIUM): Suboptimal Polling Strategy

**Evidence**: `browser_probe.py:646`, `browser_probe.py:789`

Two-phase CDP:
- Polls at 500ms intervals (fixed, not adaptive)
- Copies SQLite cookie DB on EVERY poll → disk I/O bottleneck
- No exponential backoff

Playwright solve:
- Polls at 1s intervals for 30 iterations (fixed)
- No adaptive timeouts based on domain profile

### Finding 12 (MEDIUM): No Context Pooling

Every solve creates a new `browser.new_context()`, which:
- Pays JavaScript engine init cost
- Reinjects STEALTH_JS
- Creates fresh browser session (no cached resources)

Pooling 3-5 pre-warmed contexts would save ~1s per solve.

### Finding 13 (LOW): SQLite Copy Contention

**Evidence**: `browser_probe.py:651`

`shutil.copy2(cookie_db, temp_db)` on EVERY poll cycle (500ms). This is:
- Synchronous disk I/O in an async context
- Competing with Chromium's SQLite writes
- Creating temp files that need cleanup

---

## AXIS 4: Memory Audit

### Finding 14 (MEDIUM): Single Global Browser, No Size Limit

**Evidence**: `browser_probe.py:260-303`

One `self._browser` shared across all domains:
- Chromium process: ~300-500MB baseline
- Contexts accumulate in `self._contexts` dict with no limit
- No max context count, no TTL-based context eviction
- Under load (20 concurrent solves @ `BROWSER_POOL_SIZE=4`): memory could hit 2GB+

### Finding 15 (LOW): No Process Cleanup on Crash

**Evidence**: `browser_probe.py:678-688`

Two-phase CDP creates subprocess Chrome. Cleanup is best-effort:
- `terminate()` + `wait(5s)` → `kill()` on timeout
- If `finally` block doesn't run (e.g., SIGKILL on the Python process), orphaned Chrome processes leak

### Finding 16 (LOW): STEALTH_JS Memory Overhead

50 lines of JS injected per context → ~3KB per context. Negligible individually, but 20 concurrent contexts = 60KB of injected JS that's re-parsed every time.

---

## AXIS 5: Threading Audit

### Finding 17 (MEDIUM): GIL Blocked During Page Load

**Evidence**: `browser_probe.py:498`

`page.goto()` and `page.content()` are async but **not CPU-bound**. The main GIL issue:
- `asyncio.to_thread()` for cloudscraper (synchronous `requests` calls) blocks a thread
- Playwright operations are I/O bound (network, Chromium IPC) and yield the event loop
- But JS evaluation (`page.evaluate()`) blocks the event loop during execution

**Actual GIL impact**: LOW for basic solves. MEDIUM if CF challenge JS is CPU-intensive.

### Finding 18 (LOW): No Per-Domain Semaphore

**Evidence**: `main.py:29`

Global `FETCH_SEMAPHORE = Semaphore(20)`:
- 20 solves total, across ALL domains
- One domain's slow rate-limited solves can starve other domains
- Should be per-domain semaphores (max 3 concurrent solves per domain)

### Finding 19 (LOW): No Total-Operation Timeout

**Evidence**: `browser_probe.py:856-866`

`solve_cf()` only passes `timeout_ms` to `page.goto()`, not to the total solve operation. A solve can hang on:
- Poll loop never finding cf_clearance (runs up to `max_attempts * poll_interval` = 30s)
- Two-phase CDP cookie polling (runs up to `timeout_ms` = 60s)

No hard timeout wrapping the entire `solve_cf() → _solve_cf_*()` chain.

---

## Remediation Plan

### P0 (Immediate — Fix Before Next Deploy)

| # | Issue | Action | File(s) | Effort |
|---|---|---|---|---|
| 1 | STEALTH_JS counterproductive | **DELETE STEALTH_JS** and `add_init_script`. Replace with: (a) Patchright npm package for protocol-layer stealth, or (b) minimal launch-arg cleanup only | `browser_probe.py:53-218`, `:332` | 2h |
| 2 | CDP active during navigation | Defer `Network.enable` / all CDP domain activation until AFTER first navigation succeeds. Navigate in "clean" mode, then activate collectors | `browser_probe.py:360-368`, `:498` | 3h |
| 3 | No cookie sync to Rust | Add `/api/cookies/import` endpoint on Rust side. Python POSTs `cf_clearance` + domain + IP + UA after each solve | `main.py`, `cookie_cache.rs` | 4h |

### P1 (High Priority)

| # | Issue | Action | File(s) | Effort |
|---|---|---|---|---|
| 4 | Headless mode detectable | Add `BROWSER_HEADLESS_DEFAULT=false` option. Support `headless: false` with `DISPLAY`/Xvfb for headless servers | `browser_probe.py:45` | 1h |
| 5 | Config-level fingerprint hacks | Remove `--disable-gpu`, `--disable-blink-features=AutomationControlled`. Let Playwright use defaults. Set `viewport: null` | `browser_probe.py:275-296` | 0.5h |
| 6 | No circuit breaker on Python side | Add circuit breaker to `DomainProfile`: open-circuit after N consecutive failures, half-open after cooldown | `engine.py:22-66` | 2h |
| 7 | No browser warmup | Implement `warmup()` to create 2-3 pre-warmed contexts. Pre-navigate to `about:blank`, inject stealth, keep warm pool | `browser_probe.py:912-918` | 3h |
| 8 | Context pooling | Replace single-use `acquire_session/create_context` with pooled context manager. Reuse contexts across solves for same domain | `browser_probe.py:305-335` | 4h |

### P2 (Medium Priority)

| # | Issue | Action | File(s) | Effort |
|---|---|---|---|---|
| 9 | SQLite copy contention | Use in-memory polling instead: inject JS to read `document.cookie` periodically, or use CDP `Network.getCookies` instead of raw SQLite | `browser_probe.py:646-676` | 2h |
| 10 | Adaptive polling | Implement exponential backoff in poll loops. Start at 200ms, cap at 2000ms, reset on state change | `browser_probe.py:644-676`, `:789-795` | 1h |
| 11 | Per-domain semaphore | Replace global `FETCH_SEMAPHORE` with per-domain semaphores (max 3 concurrent per domain, 20 global max) | `main.py:28-29` | 1h |
| 12 | Total-operation timeout | Wrap `solve_cf()` in `asyncio.wait_for()` with timeout. Fail gracefully with informative error | `browser_probe.py:828-866` | 0.5h |
| 13 | Profile persistence | Save/load profile dir per domain. Use persistent profile so return visits look like a real user | `browser_probe.py:577` | 3h |

### P3 (Enhancement)

| # | Issue | Action | File(s) | Effort |
|---|---|---|---|---|
| 14 | CloakBrowser integration | Add optional `--cloak` mode: download CloakBrowser binary, use its 49 C++ patches. Add `CLOAK_ENABLED` env var | `browser_probe.py:260-303` | 5h |
| 15 | Frida dynamic analysis | Use js-reverse-mcp or Frida to hook CF's challenge JS at runtime. Identify exact fingerprint signals CF collects. Report back findings | External research | 8h |
| 16 | Cross-process health | Add heartbeat endpoint on bypass service, health check in Rust client, graceful degradation when bypass is unavailable | `main.py`, Rust fetcher | 2h |
| 17 | Max context limit | Add `MAX_CONTEXTS=20` limit to `self._contexts`. LRU eviction when exceeded. TTL-based auto-close | `browser_probe.py:875` | 1h |

### P4 (Research / Investigate)

| # | Issue | Action | Effort |
|---|---|---|---|
| 18 | TLS/HTTP/2 fingerprint gaps | Capture TLS handshake and JA3/JA4 fingerprints from our Playwright Chrome vs. real Chrome. Identify differences | 4h |
| 19 | Patchright as drop-in replacement | Test replacing Playwright's `chromium.launch` with Patchright's for protocol-layer stealth. Compare detection rates on BrowserScan/creepjs | 8h |
| 20 | Unicorn emulation for CF v1/v2 | Investigate using Unicorn (via reverse-skills) to emulate CF challenge JS without a browser. Would eliminate CDP detection entirely | Research |

---

## Cross-Reference: tools used

| Repo | Used For | Key Finding |
|---|---|---|
| **js-reverse-mcp** | Anti-detection architecture analysis | STEALTH_JS is counterproductive; CDP deferral critical; CloakBrowser for hard targets |
| **reverse-skill** | Workflow methodology | Observe-first → Capture → Rebuild workflow for JS RE; tool routing matrix |
| **reverse-skills** | Frida dynamic analysis reference | Frida could hook CF challenge JS at runtime to fingerprint what signals CF collects |
| **IDA-NO-MCP** | Not applied | Binary RE not relevant to web CF bypass |

---

## Repository Locations

The 4 RE repos are cloned locally at:
- `/tmp/reverse-skills` — `git clone https://github.com/P4nda0s/reverse-skills.git`
- `/tmp/reverse-skill` — `git clone https://github.com/zhaoxuya520/reverse-skill.git`
- `/tmp/js-reverse-mcp` — `git clone https://github.com/zhizhuodemao/js-reverse-mcp.git`
- `/tmp/IDA-NO-MCP` — `git clone https://github.com/P4nda0s/IDA-NO-MCP.git`
