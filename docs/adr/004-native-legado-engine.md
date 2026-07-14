# ADR 004: Native Legado Engine Implementation

## Status
Accepted

## Context
The project needs to support Legado book sources (a popular Android reading app format). Previously, Legado sources were converted to NXS format, but this loses fidelity for complex sources.

## Decision
We will implement a native Legado engine in Rust that directly executes Legado rules without conversion:

1. **Data Model** (`nexus-core/src/legado.rs`):
   - `LegadoSource` mirrors Android `BookSource` class
   - Sub-rules: `SearchRule`, `BookInfoRule`, `TocRule`, `ContentRule`, `ExploreRule`, `ReviewRule`

2. **Rule Parser** (`nexus-engine/src/legado/rule_parser.rs`):
   - Parses Legado rule strings with operators:
     - `||` (fallback): try each selector until one succeeds
     - `&&` (concat): concatenate results from all selectors
     - `%%` (merge): zip results by index (for explore rules)
   - Mode detection: `@js:`, `<js>`, `@json:`, `@xpath:`, `@css:`, `@regex:`, `@text:`
   - Regex clean: `##pattern##replacement` postfix
   - Global LRU cache for compiled rules

3. **Selectors** (`nexus-engine/src/legado/selector/`):
   - CSS: `scraper` + `selectors` crate
   - XPath: `quick_xml` + custom evaluator
   - JSONPath: `serde_json_path` + JSON pointer fast path
   - Regex: `regex` crate with LRU cache
   - JS: `rquickjs` (native) or Node.js fallback

4. **Operators** (`nexus-engine/src/legado/operator/`):
   - Fallback: try each, return first non-empty
   - Concat: concatenate all results
   - Merge: zip by index
   - Regex clean: post-process with pattern/replacement

5. **Engine** (`nexus-engine/src/legado/engine.rs`):
   - Implements `BookEngine` + `BookEngineRuntime` traits
   - Search: resolves URL templates, handles JS-prefixed URLs, fetches via anti-crawl chain
   - Book info: fetches book URL, parses via `ruleBookInfo`
   - Chapters: fetches TOC URL, extracts `chapterList` via CSS/JS
   - Content: fetches chapter URL, extracts via `ruleContent.content`, applies regex/replace

6. **Storage** (`nexus-storage/src/legado_source_store.rs`):
   - Loads `*.json`/`*.legado` from `sources/legado/`
   - Supports both single object and array of sources
   - Skips `ALL.json`, `legado-quality.json`, `analysis.json`

## Consequences
**Positive:**
- Full Legado compatibility without conversion loss
- Native Rust performance (no JS bridge needed for most sources)
- Circuit breaker integration for reliability
- Adaptive solving per domain (learns best method)

**Negative:**
- Significant implementation effort (~3000 lines)
- JS execution requires `rquickjs` (native) or Node.js fallback
- Complex rule syntax parsing
- More code to maintain than simple NXS converter

## Implementation Status
- ✅ Data model (`LegadoSource` with all sub-rules)
- ✅ Rule parser with all operators and modes
- ✅ CSS/JSONPath/Regex selectors
- ✅ XPath/JS selectors (stubs, need full impl)
- ✅ Operators (fallback, concat, merge, regex_clean)
- ✅ Engine with all 4 methods (search, book_info, chapters, content)
- ✅ Storage loading from `sources/legado/`
- ✅ Engine registry integration
- 🟡 JS engine integration (rquickjs working, need Node.js fallback)
- 🟡 WebView sources (`webJs`) - not supported