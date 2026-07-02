#!/usr/bin/env python3
"""
Daily Legado Book Source Fetch Pipeline

Fetches, classifies, and imports Legado book sources from community repositories.
Supports AOAOSTAR (JSON) and YCKCEO (HTML table) sources.

Usage:
    python scripts/daily-legado-fetch.py --fetch
    python scripts/daily-legado-fetch.py --analyze
    python scripts/daily-legado-fetch.py --auto --import-api http://localhost:8080
    python scripts/daily-legado-fetch.py --save /path/to/output.json

Data flow:
    Source repositories → download & cache → parse → classify → save JSON
    → POST to Rust API → update quality tracking DB
"""

import argparse
import json
import logging
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urljoin

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
REPO_ROOT = Path(__file__).resolve().parents[1]
SOURCES_DIR = REPO_ROOT / "api" / "sources" / "legado"
QUALITY_DB_PATH = REPO_ROOT / "api" / "sources" / "legado-quality.json"
LOG_PATH = REPO_ROOT / "api" / "sources" / "legado-fetch.log"

# Ensure directories exist
SOURCES_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.FileHandler(str(LOG_PATH), encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("legado-fetch")

# ---------------------------------------------------------------------------
# AOAOSTAR source definitions
# ---------------------------------------------------------------------------
AOAOSTAR_SOURCES: List[Dict[str, Any]] = [
    {"name": "全量书源", "url": "https://legado.aoaostar.com/sources/b778fe6b.json", "expected": 3911},
    {"name": "XIU2精品书源", "url": "https://legado.aoaostar.com/sources/4dc410d1.json", "expected": 26},
    {"name": "破冰书源", "url": "https://legado.aoaostar.com/sources/e3e5d620.json", "expected": 128},
    {"name": "关耳女频", "url": "https://legado.aoaostar.com/sources/e29e19ee.json", "expected": 86},
    {"name": "酷安@三舞313书源", "url": "https://legado.aoaostar.com/sources/3bb7b751.json", "expected": 1554},
    {"name": "酷安@开源阅读软件", "url": "https://legado.aoaostar.com/sources/c5791307.json", "expected": 2117},
]

YCKCEO_BASE = "https://www.yckceo.com"
YCKCEO_INDEX = f"{YCKCEO_BASE}/yuedu/shuyuan/index.html"

# ---------------------------------------------------------------------------
# Data types
# ---------------------------------------------------------------------------

@dataclass
class QualityEntry:
    """Tracks quality/health metadata for a single Legado source."""
    source_name: str
    source_url: str
    group: Optional[str]
    classification: str
    download_count: int = 0
    import_date: Optional[str] = None
    health_status: str = "unknown"
    fully_automatable: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

class HTTPFetcher:
    """Simple HTTP fetcher with retry logic, agent rotation, and timeouts."""

    USER_AGENTS = [
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 "
        "(KHTML, like Gecko) Version/17.2 Safari/605.1.15",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ]

    def __init__(self, max_retries: int = 3, timeout: int = 30):
        self.max_retries = max_retries
        self.timeout = timeout
        self._agent_idx = 0

    def _next_agent(self) -> str:
        agent = self.USER_AGENTS[self._agent_idx % len(self.USER_AGENTS)]
        self._agent_idx += 1
        return agent

    def fetch_text(self, url: str) -> str:
        return self._fetch(url, binary=False)

    def fetch_json(self, url: str) -> Any:
        data = self._fetch(url, binary=False)
        return json.loads(data)

    def fetch_bytes(self, url: str) -> bytes:
        return self._fetch(url, binary=True)

    def _fetch(self, url: str, binary: bool) -> Any:
        last_error: Optional[Exception] = None
        for attempt in range(1, self.max_retries + 1):
            try:
                req = urllib.request.Request(
                    url,
                    headers={
                        "User-Agent": self._next_agent(),
                        "Accept": "application/json, text/html, */*",
                        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                    },
                )
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    content = resp.read()
                    if binary:
                        return content
                    # Try UTF-8 first, fall back to detected encoding
                    try:
                        return content.decode("utf-8")
                    except UnicodeDecodeError:
                        # Fallback: try common Chinese encodings
                        for encoding in ("gbk", "gb2312", "gb18030", "big5", "shift_jis", "euc-jp"):
                            try:
                                return content.decode(encoding)
                            except (UnicodeDecodeError, LookupError):
                                continue
                        # Last resort: latin-1 (never fails)
                        return content.decode("latin-1")
            except (urllib.error.URLError, urllib.error.HTTPError, OSError) as e:
                last_error = e
                log.warning("Attempt %d/%d failed for %s: %s", attempt, self.max_retries, url, e)
                if attempt < self.max_retries:
                    time.sleep(2 * attempt)
        raise RuntimeError(f"Failed to fetch {url} after {self.max_retries} attempts: {last_error}")


fetcher = HTTPFetcher()


# ---------------------------------------------------------------------------
# Quality database
# ---------------------------------------------------------------------------

class QualityDB:
    """Persistent quality tracking database for Legado sources."""

    def __init__(self, path: Path):
        self.path = path
        self.data: Dict[str, QualityEntry] = {}
        self._load()

    def _load(self) -> None:
        if self.path.exists():
            try:
                raw = json.loads(self.path.read_text(encoding="utf-8"))
                for key, val in raw.items():
                    self.data[key] = QualityEntry(**val)
                log.info("Loaded %d entries from quality DB", len(self.data))
            except (json.JSONDecodeError, KeyError, TypeError) as e:
                log.warning("Corrupt quality DB (%s), starting fresh", e)

    def save(self) -> None:
        raw = {key: entry.to_dict() for key, entry in self.data.items()}
        self.path.write_text(
            json.dumps(raw, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        log.info("Saved quality DB (%d entries)", len(self.data))

    def get_or_create(self, source_id: str, name: str, url: str, group: Optional[str]) -> QualityEntry:
        if source_id not in self.data:
            self.data[source_id] = QualityEntry(
                source_name=name,
                source_url=url,
                group=group,
                classification="unknown",
            )
        entry = self.data[source_id]
        # Update name/url in case they changed
        entry.source_name = name
        entry.source_url = url
        entry.group = group
        return entry

    def mark_imported(self, source_id: str, classification: str, fully_automatable: bool) -> None:
        entry = self.data.get(source_id)
        if entry:
            now = datetime.now(timezone.utc).isoformat()
            entry.import_date = now
            entry.classification = classification
            entry.fully_automatable = fully_automatable
            entry.health_status = "imported"


# ---------------------------------------------------------------------------
# Classification helpers
# ---------------------------------------------------------------------------

def _serialize_for_patterns(source: Dict[str, Any]) -> str:
    """Serialize a source dict to JSON string for pattern matching."""
    return json.dumps(source, ensure_ascii=False)


def has_web_js(source: Dict[str, Any]) -> bool:
    """Check if source has non-empty ruleContent.webJs."""
    rc = source.get("ruleContent") or {}
    web_js = rc.get("webJs")
    return bool(web_js and str(web_js).strip())


def has_js_rules(source: Dict[str, Any]) -> bool:
    """Check if source contains `@js:` or `<js>` patterns in any rule field."""
    raw = _serialize_for_patterns(source)
    return "@js:" in raw or "<js>" in raw or "</js>" in raw


def has_xpath(source: Dict[str, Any]) -> bool:
    """Check if source uses XPath selectors."""
    raw = _serialize_for_patterns(source)
    return "@xpath:" in raw or "@XPath:" in raw


def classify(source: Dict[str, Any]) -> str:
    """Classify a Legado source into webjs/js/xpath/css."""
    if has_web_js(source):
        return "webjs"
    if has_js_rules(source):
        return "js"
    if has_xpath(source):
        return "xpath"
    return "css"


def is_fully_automatable(source: Dict[str, Any]) -> bool:
    """A source is fully automatable iff it has no webJs and no XPath."""
    return not has_web_js(source) and not has_xpath(source)


def infer_source_id(source: Dict[str, Any]) -> str:
    """Stable source ID derived from the book source URL (matching Rust infer_id)."""
    url = source.get("bookSourceUrl", "")
    domain = (
        url.removeprefix("https://")
        .removeprefix("http://")
        .removeprefix("www.")
        .split("/")[0]
        .split(".")[0]
    )
    return domain if domain else "unknown"


def is_valid_source(source: Dict[str, Any]) -> Tuple[bool, str]:
    """Validate a source before import. Returns (valid, reason)."""
    name = source.get("bookSourceName", "").strip()
    if not name:
        return False, "missing bookSourceName"
    if len(name) > 100:
        return False, f"bookSourceName too long ({len(name)} chars)"
    search_url = source.get("searchUrl")
    if not search_url or not str(search_url).strip():
        return False, "missing searchUrl"
    url = source.get("bookSourceUrl", "").strip()
    if not url:
        return False, "missing bookSourceUrl"
    return True, "ok"


# ---------------------------------------------------------------------------
# AOAOSTAR fetcher
# ---------------------------------------------------------------------------

def fetch_aoaostar() -> Dict[str, List[Dict[str, Any]]]:
    """Download all AOAOSTAR source collections. Returns {collection_name: [sources]}."""
    results: Dict[str, List[Dict[str, Any]]] = {}
    for src_def in AOAOSTAR_SOURCES:
        name = src_def["name"]
        url = src_def["url"]
        expected = src_def["expected"]
        log.info("Fetching AOAOSTAR '%s' (%s)...", name, url)
        try:
            raw = fetcher.fetch_json(url)
            # AOAOSTAR returns {"data": [...]} or just the array
            if isinstance(raw, dict) and "data" in raw:
                sources = raw["data"]
            elif isinstance(raw, dict) and "sources" in raw:
                sources = raw["sources"]
            elif isinstance(raw, list):
                sources = raw
            else:
                log.warning("  Unexpected JSON structure, treating whole response as data: %s", type(raw))
                sources = [raw] if isinstance(raw, dict) else []

            if not isinstance(sources, list):
                log.warning("  'sources' is not a list, got %s", type(sources))
                sources = []

            # Normalize: AOAOSTAR wraps in extra object sometimes
            normalized = []
            for s in sources:
                if isinstance(s, dict) and "bookSourceUrl" not in s and "sources" in s:
                    # Nested { sources: [actual, ...] }
                    for ss in s.get("sources", []):
                        if isinstance(ss, dict):
                            normalized.append(ss)
                elif isinstance(s, dict):
                    normalized.append(s)

            results[name] = normalized
            log.info("  Got %d sources (expected ~%d)", len(normalized), expected)
        except Exception as e:
            log.error("  Failed to fetch AOAOSTAR '%s': %s", name, e)
            results[name] = []
    return results


# ---------------------------------------------------------------------------
# YCKCEO fetcher
# ---------------------------------------------------------------------------

def _parse_yckceo_page(html: str) -> Tuple[List[Dict[str, str]], int]:
    """
    Parse YCKCEO HTML page (layui card grid layout, not a table).

    Each source card has the structure::

        <div class="ylist">
            <p class="checkboxclass"><input ... name="ids[]" value="7521" ...></p>
            <h2><a href="/yuedu/shuyuan/content/id/7521.html">🌟漫蛙动漫🔞 https://manwaqu.cc</a>
                <p class="m-right" style="top: 3px;">23小时前</p>
            </h2>
            <span class="layui-badge-rim layui-bg-gray layui-font-black">3.X</span>
            <span class="layui-badge-rim ...">发 搜 </span>
            <span class="layui-badge-rim ..." title="UID:...">用户: langzaier</span>
            <span class="layui-badge-rim ...">下载:2872</span>
        </div>

    Returns (entries, total_entries).
    """
    entries: List[Dict[str, str]] = []
    total_entries = 0

    # Total entries count from: 共有 5524 条数据
    total_match = re.search(r'共有\s*(\d+)\s*条数据', html)
    if total_match:
        total_entries = int(total_match.group(1))

    # Find each source card: <div class="ylist"> ... </div>
    card_pattern = re.compile(
        r'<div\s+class\s*=\s*["\']ylist["\'][^>]*>(.*?)</div>\s*</div>',
        re.DOTALL,
    )

    for card_match in card_pattern.finditer(html):
        card_html = card_match.group(1)

        # --- Name & source URL from <h2><a href="...">name</a> ---
        link_match = re.search(
            r'<a\s+href\s*=\s*["\']([^"\']+)["\'][^>]*>(.*?)</a>',
            card_html,
            re.DOTALL,
        )
        if not link_match:
            continue
        source_url = link_match.group(1).strip()
        if source_url.startswith("/"):
            source_url = urljoin(YCKCEO_BASE, source_url)
        source_name_raw = re.sub(r'<[^>]+>', '', link_match.group(2)).strip()
        source_name_raw = source_name_raw.replace("&nbsp;", " ").replace("&amp;", "&").strip()
        # Remove HTML entities
        source_name_raw = re.sub(r'&#\d+;', '', source_name_raw).strip()
        if not source_name_raw:
            continue

        # --- Update time from <p class="m-right"> ---
        update_match = re.search(
            r'<p\s+class\s*=\s*["\']m-right["\'][^>]*>(.*?)</p>',
            card_html,
            re.DOTALL,
        )
        update_time = re.sub(r'<[^>]+>', '', update_match.group(1)).strip() if update_match else ""

        # --- User from span containing "用户:" ---
        user_match = re.search(
            r'<span[^>]*>用户:\s*([^<]+)</span>',
            card_html,
        )
        user = user_match.group(1).strip() if user_match else ""

        # --- Downloads from span containing "下载:" ---
        downloads_match = re.search(
            r'<span[^>]*>下载:\s*([^<]+)</span>',
            card_html,
        )
        downloads = 0
        if downloads_match:
            dl_str = downloads_match.group(1).strip()
            dl_num = re.search(r'(\d[\d,]*)', dl_str)
            if dl_num:
                downloads = int(dl_num.group(1).replace(",", ""))

        entries.append({
            "name": source_name_raw,
            "url": source_url,
            "update_time": update_time,
            "downloads": downloads,
            "user": user,
        })

    return entries, total_entries


def fetch_yckceo(max_pages: int = 50) -> Dict[str, List[Dict[str, Any]]]:
    """
    Fetch YCKCEO source listings from the card-based layout.

    Pagination uses ``?page=N`` query parameter (e.g.
    ``/yuedu/shuyuan/index.html?page=2``).

    Returns {collection_name: [sources]} where collection_name is like "yckceo-p1".
    """
    results: Dict[str, List[Dict[str, Any]]] = {}
    all_entries: List[Dict[str, str]] = []
    total_entries_known = 0

    log.info("Fetching YCKCEO index page...")
    try:
        html = fetcher.fetch_text(YCKCEO_INDEX)
    except Exception as e:
        log.error("Failed to fetch YCKCEO index: %s", e)
        return results

    entries, total_entries_known = _parse_yckceo_page(html)
    all_entries.extend(entries)
    log.info("  Page 1: %d entries (total: ~%d)", len(entries), total_entries_known)

    # Determine how many pages to fetch
    entries_per_page = len(entries) if entries else 48
    total_pages_known = (
        (total_entries_known + entries_per_page - 1) // entries_per_page
        if total_entries_known > 0
        else max_pages
    )
    pages_to_fetch = min(max_pages, total_pages_known)

    # Fetch subsequent pages using ?page=N format
    for page_num in range(2, pages_to_fetch + 1):
        page_url = f"{YCKCEO_BASE}/yuedu/shuyuan/index.html?page={page_num}"
        try:
            html = fetcher.fetch_text(page_url)
            entries, _ = _parse_yckceo_page(html)
            all_entries.extend(entries)
            log.info("  Page %d/%d: %d entries", page_num, total_pages_known, len(entries))
        except Exception as e:
            log.warning("  Page %d failed: %s", page_num, e)
        time.sleep(0.3)  # Be nice to YCKCEO

    log.info(
        "YCKCEO: Got %d total entries across %d/%d pages",
        len(all_entries),
        pages_to_fetch,
        total_pages_known,
    )

    # Store metadata for analysis (downloads, user, etc.)
    results["yckceo-metadata"] = all_entries
    # Also store entry names/URLs for the import pipeline
    results["yckceo"] = []
    for entry in all_entries:
        results["yckceo"].append({
            "bookSourceName": entry["name"],
            "bookSourceUrl": entry["url"],
            "_yckceo_downloads": entry.get("downloads", 0),
            "_yckceo_user": entry.get("user", ""),
            "_yckceo_update_time": entry.get("update_time", ""),
        })

    return results


# ---------------------------------------------------------------------------
# Classification runner
# ---------------------------------------------------------------------------

def classify_sources(
    raw_sources: Dict[str, List[Dict[str, Any]]],
    quality_db: QualityDB,
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Classify all sources across all collections.
    Returns dict of {collection_name: [enriched_source_dicts]}.
    Each enriched source has classification info merged in.
    """
    result: Dict[str, List[Dict[str, Any]]] = {}
    stats: Dict[str, int] = {"webjs": 0, "js": 0, "xpath": 0, "css": 0, "invalid": 0, "total": 0}

    for collection_name, sources in raw_sources.items():
        if not sources:
            result[collection_name] = []
            continue

        enriched: List[Dict[str, Any]] = []
        for src in sources:
            stats["total"] += 1
            valid, reason = is_valid_source(src)
            if not valid:
                stats["invalid"] += 1
                log.debug("  Invalid source: %s (%s)", src.get("bookSourceName", "?"), reason)
                continue

            cls = classify(src)
            automatable = is_fully_automatable(src)
            src_id = infer_source_id(src)

            # Add classification metadata
            src["_classification"] = cls
            src["_fully_automatable"] = automatable
            src["_source_id"] = src_id

            # Update quality DB
            entry = quality_db.get_or_create(
                src_id,
                src.get("bookSourceName", ""),
                src.get("bookSourceUrl", ""),
                src.get("bookSourceGroup"),
            )
            entry.classification = cls
            entry.fully_automatable = automatable

            stats[cls] += 1
            enriched.append(src)

        result[collection_name] = enriched
        log.info(
            "%s: %d sources (%s)",
            collection_name,
            len(enriched),
            ", ".join(f"{k}={v}" for k, v in stats.items() if k != "total"),
        )

    # Print summary
    total_valid = stats["total"] - stats["invalid"]
    log.info("=" * 60)
    log.info("Classification Summary:")
    log.info("  Total sources:          %d", stats["total"])
    log.info("  Invalid/skipped:        %d", stats["invalid"])
    log.info("  Valid sources:          %d", total_valid)
    log.info("  webjs (WebView needed): %d (%5.1f%%)", stats["webjs"], (stats["webjs"] / total_valid * 100) if total_valid else 0)
    log.info("  js (JS engine):         %d (%5.1f%%)", stats["js"], (stats["js"] / total_valid * 100) if total_valid else 0)
    log.info("  xpath (needs convert):  %d (%5.1f%%)", stats["xpath"], (stats["xpath"] / total_valid * 100) if total_valid else 0)
    log.info("  css (fully automatable):%d (%5.1f%%)", stats["css"], (stats["css"] / total_valid * 100) if total_valid else 0)
    log.info("=" * 60)

    return result


# ---------------------------------------------------------------------------
# Save to disk
# ---------------------------------------------------------------------------

def save_classified(
    classified: Dict[str, List[Dict[str, Any]]],
    output_dir: Path,
) -> int:
    """
    Save classified sources to disk.
    Each collection gets its own JSON file in output_dir.
    Also writes a consolidated ALL.json with all sources.
    Returns total number of sources saved.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    total = 0

    all_sources: List[Dict[str, Any]] = []
    for collection_name, sources in classified.items():
        if not sources or collection_name.endswith("-metadata"):
            continue
        # Sanitize filename
        safe_name = re.sub(r'[^\w\-]', '_', collection_name)
        path = output_dir / f"{safe_name}.json"
        path.write_text(
            json.dumps(sources, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        total += len(sources)
        all_sources.extend(sources)
        log.info("Saved %s: %d sources to %s", collection_name, len(sources), path)

    # Also save individual source files (matching Rust LegadoSourceStore pattern)
    # in a subdirectory to avoid conflicts with collection files
    individual_dir = output_dir / "individual"
    individual_dir.mkdir(parents=True, exist_ok=True)
    for src in all_sources:
        src_id = src.get("_source_id", infer_source_id(src))
        # Remove internal classification fields before saving individual file
        clean = {k: v for k, v in src.items() if not k.startswith("_")}
        individual_path = individual_dir / f"{src_id}.json"
        individual_path.write_text(
            json.dumps(clean, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    # Write consolidated file
    consolidated = output_dir / "ALL.json"
    consolidated.write_text(
        json.dumps(all_sources, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    log.info("Saved consolidated ALL.json: %d sources", total)

    return total


# ---------------------------------------------------------------------------
# API Import
# ---------------------------------------------------------------------------

def import_to_api(
    classified: Dict[str, List[Dict[str, Any]]],
    base_url: str,
    quality_db: QualityDB,
    batch_size: int = 100,
) -> Dict[str, Any]:
    """
    POST classified Legado sources to the API endpoint in batches.
    Returns summary of import results.
    """
    api_url = f"{base_url.rstrip('/')}/api/sources/legado/import"
    summary = {
        "total": 0,
        "imported": 0,
        "failed": 0,
        "skipped": 0,
        "errors": [],
    }

    # Collect all valid sources from all collections (skip metadata)
    all_sources: List[Dict[str, Any]] = []
    for collection_name, sources in classified.items():
        if collection_name.endswith("-metadata"):
            continue
        all_sources.extend(sources)

    summary["total"] = len(all_sources)
    log.info("Importing %d sources to %s (batch size: %d)...", len(all_sources), api_url, batch_size)

    # Process in batches
    for i in range(0, len(all_sources), batch_size):
        batch = all_sources[i : i + batch_size]
        # Clean internal fields before sending
        clean_batch = [
            {k: v for k, v in src.items() if not k.startswith("_")}
            for src in batch
        ]

        batch_num = i // batch_size + 1
        total_batches = (len(all_sources) + batch_size - 1) // batch_size

        for attempt in range(1, 4):  # Retry up to 3 times
            try:
                data = json.dumps(clean_batch, ensure_ascii=False).encode("utf-8")
                req = urllib.request.Request(
                    api_url,
                    data=data,
                    headers={
                        "Content-Type": "application/json; charset=utf-8",
                        "User-Agent": fetcher._next_agent(),
                    },
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=60) as resp:
                    body = resp.read().decode("utf-8")
                    result = json.loads(body)

                # Parse result
                imported_count = 0
                failed_count = 0
                if isinstance(result, dict):
                    items = result.get("data", [])
                    for item in items:
                        if isinstance(item, dict) and item.get("imported"):
                            imported_count += 1
                        else:
                            failed_count += 1
                else:
                    imported_count = len(clean_batch)

                summary["imported"] += imported_count
                summary["failed"] += failed_count

                # Update quality DB for imported sources
                for src in batch:
                    src_id = src.get("_source_id", infer_source_id(src))
                    cls = src.get("_classification", classify(src))
                    automatable = src.get("_fully_automatable", is_fully_automatable(src))
                    quality_db.mark_imported(src_id, cls, automatable)

                log.info(
                    "  Batch %d/%d: %d sources (imported=%d, failed=%d)",
                    batch_num,
                    total_batches,
                    len(clean_batch),
                    imported_count,
                    failed_count,
                )
                break  # Success, no retry needed

            except (urllib.error.HTTPError, urllib.error.URLError, OSError, json.JSONDecodeError) as e:
                log.warning(
                    "  Batch %d/%d attempt %d failed: %s",
                    batch_num,
                    total_batches,
                    attempt,
                    e,
                )
                if attempt == 3:
                    summary["failed"] += len(clean_batch)
                    summary["errors"].append(str(e))
                else:
                    time.sleep(3 * attempt)

        # Brief pause between batches
        time.sleep(0.5)

    log.info(
        "Import complete: %d/%d imported, %d failed",
        summary["imported"],
        summary["total"],
        summary["failed"],
    )
    return summary


# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------

def print_analysis(
    classified: Dict[str, List[Dict[str, Any]]],
    quality_db: QualityDB,
) -> None:
    """Print comprehensive analysis of the sourced data."""
    print()
    print("=" * 70)
    print("  LEGADO SOURCE ANALYSIS")
    print("=" * 70)

    # Collect all sources
    all_sources: List[Dict[str, Any]] = []
    for collection_name, sources in classified.items():
        if collection_name.endswith("-metadata"):
            continue
        all_sources.extend(sources)

    total_all = len(all_sources)
    valid = [s for s in all_sources if is_valid_source(s)[0]]
    invalid = total_all - len(valid)

    print()
    print("📊 OVERVIEW")
    print(f"  Total sources fetched:     {total_all}")
    print(f"  Valid sources:             {len(valid)}")
    print(f"  Invalid/skipped:           {invalid}")

    # Classification breakdown
    webjs = [s for s in valid if s.get("_classification") == "webjs"]
    js = [s for s in valid if s.get("_classification") == "js"]
    xpath = [s for s in valid if s.get("_classification") == "xpath"]
    css = [s for s in valid if s.get("_classification") == "css"]

    print()
    print("📋 CLASSIFICATION")
    print(f"  {'webjs':<25} {len(webjs):>6}  ({len(webjs)/len(valid)*100:5.1f}%) — Requires WebView, highest complexity")
    print(f"  {'js':<25} {len(js):>6}  ({len(js)/len(valid)*100:5.1f}%) — Needs JS engine")
    print(f"  {'xpath':<25} {len(xpath):>6}  ({len(xpath)/len(valid)*100:5.1f}%) — Needs XPath conversion")
    print(f"  {'css (fully automatable)':<25} {len(css):>6}  ({len(css)/len(valid)*100:5.1f}%) — Pure CSS selectors")

    # Fully automatable count
    auto = [s for s in valid if s.get("_fully_automatable")]
    print(f"\n  Fully automatable (css, no webjs): {len(auto)}/{len(valid)}")

    # Per-collection breakdown
    print()
    print("📁 PER-COLLECTION BREAKDOWN")
    for collection_name, sources in classified.items():
        if collection_name.endswith("-metadata"):
            continue
        w = sum(1 for s in sources if s.get("_classification") == "webjs")
        j = sum(1 for s in sources if s.get("_classification") == "js")
        x = sum(1 for s in sources if s.get("_classification") == "xpath")
        c = sum(1 for s in sources if s.get("_classification") == "css")
        print(f"  {collection_name:<30} {len(sources):>5} total | webjs={w:<3} js={j:<3} xpath={x:<3} css={c:<3}")

    # Top sources by downloads (from quality DB / metadata)
    print()
    print("🏆 TOP 10 MOST DOWNLOADED SOURCES")
    # YCKCEO metadata has download counts
    yckceo_meta = classified.get("yckceo-metadata", [])
    if yckceo_meta:
        sorted_by_dl = sorted(yckceo_meta, key=lambda x: x.get("downloads", 0), reverse=True)
        for rank, entry in enumerate(sorted_by_dl[:10], 1):
            name = entry.get("name", "?")
            downloads = entry.get("downloads", 0)
            print(f"  {rank:>2}. {name:<50} {downloads:>8} downloads")
    else:
        print("  (No download data available)")

    # Quality DB health summary
    print()
    print("💚 QUALITY DB STATUS")
    imported = sum(1 for e in quality_db.data.values() if e.health_status == "imported")
    unknown = sum(1 for e in quality_db.data.values() if e.health_status == "unknown")
    print(f"  Total tracked:    {len(quality_db.data)}")
    print(f"  Imported:         {imported}")
    print(f"  Unknown/pending:  {unknown}")

    by_cls: Dict[str, int] = {}
    for e in quality_db.data.values():
        by_cls[e.classification] = by_cls.get(e.classification, 0) + 1
    if by_cls:
        cls_str = ", ".join(f"{k}={v}" for k, v in sorted(by_cls.items()))
        print(f"  By classification: {cls_str}")

    print("=" * 70)
    print()


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def run_fetch() -> Dict[str, List[Dict[str, Any]]]:
    """Step 1: Fetch all source repositories."""
    log.info("=" * 60)
    log.info("STEP 1: Fetching source repositories")
    log.info("=" * 60)

    raw_sources: Dict[str, List[Dict[str, Any]]] = {}

    # AOAOSTAR
    log.info("\n--- AOAOSTAR ---")
    aoaostar_results = fetch_aoaostar()
    raw_sources.update(aoaostar_results)

    # YCKCEO
    log.info("\n--- YCKCEO ---")
    yckceo_results = fetch_yckceo(max_pages=50)
    raw_sources.update(yckceo_results)

    return raw_sources


def run_classify(
    raw_sources: Dict[str, List[Dict[str, Any]]],
    quality_db: QualityDB,
) -> Dict[str, List[Dict[str, Any]]]:
    """Step 2: Classify all sources."""
    log.info("=" * 60)
    log.info("STEP 2: Classifying sources")
    log.info("=" * 60)
    return classify_sources(raw_sources, quality_db)


def run_save(classified: Dict[str, List[Dict[str, Any]]], output_dir: Path) -> int:
    """Step 3: Save classified results to disk."""
    log.info("=" * 60)
    log.info("STEP 3: Saving classified results")
    log.info("=" * 60)
    return save_classified(classified, output_dir)


def run_import(
    classified: Dict[str, List[Dict[str, Any]]],
    api_url: str,
    quality_db: QualityDB,
) -> Dict[str, Any]:
    """Step 4: Import sources to the Rust API."""
    log.info("=" * 60)
    log.info("STEP 4: Importing to API")
    log.info("=" * 60)
    return import_to_api(classified, api_url, quality_db)


def run_analyze(
    classified: Dict[str, List[Dict[str, Any]]],
    quality_db: QualityDB,
) -> None:
    """Step 5: Print analysis."""
    log.info("=" * 60)
    log.info("STEP 5: Analysis")
    log.info("=" * 60)
    print_analysis(classified, quality_db)


def run_auto(args: argparse.Namespace) -> None:
    """Run the full pipeline."""
    quality_db = QualityDB(QUALITY_DB_PATH)

    # 1. Fetch
    raw = run_fetch()

    # 2. Classify
    classified = run_classify(raw, quality_db)

    # 3. Save to disk
    run_save(classified, SOURCES_DIR)

    # 4. Import via API (if requested)
    if args.import_api:
        run_import(classified, args.import_api, quality_db)

    # 5. Analysis
    run_analyze(classified, quality_db)

    # Persist quality DB
    quality_db.save()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Daily Legado book source fetch, classify, and import pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  %(prog)s --fetch\n"
            "  %(prog)s --analyze\n"
            "  %(prog)s --auto --import-api http://localhost:8080\n"
            "  %(prog)s --auto --import-api http://localhost:8080 --save /tmp/output.json\n"
        ),
    )

    parser.add_argument(
        "--fetch",
        action="store_true",
        help="Download all source repositories to local cache",
    )
    parser.add_argument(
        "--import-api",
        metavar="URL",
        type=str,
        default=None,
        help="POST to {URL}/api/sources/legado/import for each source",
    )
    parser.add_argument(
        "--save",
        metavar="PATH",
        type=str,
        default=None,
        help="Save classified results as JSON to PATH (in addition to default location)",
    )
    parser.add_argument(
        "--analyze",
        action="store_true",
        help="Print analysis summary",
    )
    parser.add_argument(
        "--auto",
        action="store_true",
        help="Run full pipeline (fetch + classify + save + import)",
    )

    args = parser.parse_args()

    # --
    # No args: show help
    # --
    if not any(vars(args).values()):
        parser.print_help()
        sys.exit(1)

    # --
    # --auto runs the full pipeline
    # --
    if args.auto:
        run_auto(args)
        return

    # --
    # Individual steps
    # --
    quality_db = QualityDB(QUALITY_DB_PATH)
    classified: Optional[Dict[str, List[Dict[str, Any]]]] = None

    if args.fetch:
        raw = run_fetch()
        classified = run_classify(raw, quality_db)
        run_save(classified, SOURCES_DIR)
        quality_db.save()

    # If we already have classified data from --fetch, use it
    if classified is None:
        # Try to load from disk
        consolidated_path = SOURCES_DIR / "ALL.json"
        if consolidated_path.exists():
            log.info("Loading classified sources from %s", consolidated_path)
            try:
                data = json.loads(consolidated_path.read_text(encoding="utf-8"))
                classified = {"loaded": data}
            except (json.JSONDecodeError, OSError) as e:
                log.error("Failed to load consolidated sources: %s", e)
        else:
            log.warning("No cached sources found. Run --fetch first or --auto.")

    if args.import_api and classified:
        run_import(classified, args.import_api, quality_db)
        quality_db.save()

    if args.save and classified:
        save_path = Path(args.save)
        save_path.parent.mkdir(parents=True, exist_ok=True)
        all_sources = []
        for coll, sources in classified.items():
            if coll.endswith("-metadata"):
                continue
            all_sources.extend(sources)
        save_path.write_text(
            json.dumps(all_sources, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        log.info("Saved classified results to %s (%d sources)", save_path, len(all_sources))

    if args.analyze and classified:
        run_analyze(classified, quality_db)


if __name__ == "__main__":
    main()