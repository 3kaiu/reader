# Phase 0: API Contracts Analysis

## Backend Endpoints (from nexus-lite)

### Core Reading Chain
- `GET /api/health` - Health check
- `POST /api/search` - Search books
- `GET /api/book` - Get book info (params: source, url)
- `GET /api/chapters` - Get chapter list (params: source, url)
- `GET /api/content` - Get chapter content (params: source, url)
- `POST /api/batch/content` - Batch content fetch

### Bookshelf & Groups
- `GET /api/bookshelf` - List bookshelf
- `POST /api/bookshelf` - Add to bookshelf
- `PATCH /api/bookshelf/{id}` - Update progress
- `PUT /api/bookshelf/{id}` - Move to group
- `DELETE /api/bookshelf/{id}` - Remove from bookshelf
- `GET /api/groups` - List groups
- `POST /api/groups` - Save group
- `DELETE /api/groups/{id}` - Delete group

### Sources
- `GET /api/sources` - List all sources
- `POST /api/sources` - Add source
- `GET /api/sources/{id}` - Get single source
- `DELETE /api/sources/{id}` - Delete source
- `PUT /api/sources/{id}/status` - Update source status
- `GET /api/sources/health` - Source health stats

### Replace Rules
- `GET /api/replace_rules` - List rules
- `POST /api/replace_rules` - Save rule
- `DELETE /api/replace_rules/{id}` - Delete rule

### Discovery
- `GET /api/discovery` - Discovery page

### AI (Optional Addon)
- `GET /api/ai/mappings` - List AI mappings
- `POST /api/ai/mappings` - Save AI mapping
- `DELETE /api/ai/mappings/{id}` - Delete AI mapping
- `GET /api/ai/history` - List AI history
- `POST /api/ai/history` - Save AI history
- `DELETE /api/ai/history` - Clear AI history

### Voice (Optional Addon)
- `GET /api/voice/metadata` - List voice metadata
- `POST /api/voice/metadata` - Save voice metadata
- `DELETE /api/voice/metadata/{id}` - Delete voice metadata
- `GET /api/voice/config/{key}` - Get voice config
- `POST /api/voice/config/{key}` - Save voice config

## Non-Existent Frontend API Calls

### From unified.ts (to be deleted per Phase 1)
1. `aiApi.chat()` - `/ai/chat` - NOT EXISTS
2. `aiApi.analyze()` - `/ai/analyze` - NOT EXISTS
3. `aiApi.recommend()` - `/ai/recommend` - NOT EXISTS
4. `voiceApi.synthesize()` - `/tts/synthesize` - NOT EXISTS
5. `voiceApi.getVoices()` - `/tts/voices` - NOT EXISTS
6. `voiceApi.updateSettings()` - `/tts/settings` - NOT EXISTS
7. `systemApi.getStatus()` - `/system/status` - NOT EXISTS
8. `systemApi.getConfig()` - `/system/config` - NOT EXISTS
9. `systemApi.updateConfig()` - `/system/config` - NOT EXISTS
10. `systemApi.getLogs()` - `/system/logs` - NOT EXISTS
11. `systemApi.restart()` - `/system/restart` - NOT EXISTS

### From source.ts
1. `testBookSource()` - `/sources/{id}/test` - NOT EXISTS (marked as "待实现")

### From manage.ts
1. `addBookGroupMulti()` - `/bookshelf/batch-move` - NOT EXISTS

### From group.ts
1. `saveBookGroupOrder()` - Uses `/groups` POST with orderIndex - INCONSISTENT with backend

## Minimal API Checklist for Core Reading Chain

### Required for Search
- `POST /api/search` ✅ EXISTS

### Required for Reading
- `GET /api/book` ✅ EXISTS
- `GET /api/chapters` ✅ EXISTS
- `GET /api/content` ✅ EXISTS

### Required for Bookshelf
- `GET /api/bookshelf` ✅ EXISTS
- `POST /api/bookshelf` ✅ EXISTS
- `PATCH /api/bookshelf/{id}` ✅ EXISTS
- `DELETE /api/bookshelf/{id}` ✅ EXISTS

### Required for Sources
- `GET /api/sources` ✅ EXISTS
- `POST /api/sources` ✅ EXISTS
- `DELETE /api/sources/{id}` ✅ EXISTS
- `PUT /api/sources/{id}/status` ✅ EXISTS

### Required for Replace Rules
- `GET /api/replace_rules` ✅ EXISTS
- `POST /api/replace_rules` ✅ EXISTS
- `DELETE /api/replace_rules/{id}` ✅ EXISTS

### Required for Groups
- `GET /api/groups` ✅ EXISTS
- `POST /api/groups` ✅ EXISTS
- `DELETE /api/groups/{id}` ✅ EXISTS

## Actions Required

### Phase 0 - Immediate Actions
1. ✅ Switch type-check from tsc to vue-tsc
2. ✅ Verify nexus-reader builds
3. ❌ Check nexus-lite cargo check
4. ⏳ Remove/feature-flag non-existent API calls:
   - Remove `unified.ts` imports from pages
   - Remove calls to non-existent AI/voice/system APIs
   - Remove `testBookSource()` calls
   - Remove `addBookGroupMulti()` calls
   - Fix `saveBookGroupOrder()` to match backend
5. ⏳ Document API contracts (this file)

### Phase 1 - Frontend Boundary Cleanup
1. Delete `api/unified.ts`
2. Delete `stores/unified.ts`
3. Clean up `unified-utils.ts`
4. Establish 4 journey modules: search, reader, library, source
5. Remove non-backend-supported features:
   - Source subscription
   - Source switching search
   - Pseudo WebSocket search status
   - Unclosed AI chat/recommendations
   - Unclosed TTS interfaces
