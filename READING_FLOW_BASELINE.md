# Reading Flow Baseline (Batch 1)

This document captures the current baseline for the core reading flow:

`search -> open book -> load catalog -> load chapter content -> render reader`

## Frontend Flow Matrix

| Step | Entry | Core Module | Output |
| --- | --- | --- | --- |
| Search submit | `pages/search.vue` | `useSearchView` + `useSearchActions` + `stores/search` | aggregated search results |
| Open reader from result | `useSearchActions.openBook` | `useOpenReader` + router query (`source`, `url`) | navigate to `/reader` |
| Session bootstrap | `pages/reader.vue` | `useReaderView` -> session init actions | initialize reader session |
| Load book detail | reader session actions | `stores/reader/actions/session.ts` + `readerApi.getBookInfo` | normalized current book |
| Load catalog | reader helper | `stores/reader/actions/helpers.ts::ensureCatalog` + `readerApi.getChapters` | normalized chapter list |
| Load content | reader helper | `stores/reader/actions/helpers.ts::fetchChapterContent` + `readerApi.getContent` | chapter text + stage reports |
| Render | reader experience | `ReaderExperience` + store state | visible chapter content |

## API Contract Baseline

### Reader APIs used by frontend

- `GET /api/book`
- `GET /api/chapters`
- `GET /api/content`

### Current compatibility guardrails (implemented in Batch 1)

- Catalog payload accepts both direct array and wrapped object forms (`chapters` / `items` / `data`).
- Invalid catalog items (missing `url`) are ignored.
- Missing chapter title is auto-filled (`第N章`).
- Empty catalog fails fast with actionable message.
- Empty chapter content fails with actionable message (`章节内容为空，请重试或切换书源`).
- Content stage diagnostics remain available when failures happen.

## Known User-Visible Failure Modes

- Upstream source can return empty/invalid chapter list.
- Source can return empty content body for a valid chapter URL.
- Network/interceptor errors may occur during stream search fallback.

These are now surfaced as deterministic reader errors instead of silent blank content.

