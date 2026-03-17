# IndexedDB stores contract (nexus-reader)

本文件作为前端 IndexedDB 的 **schema 单一真相**（避免 `StoreNames`、业务代码、迁移逻辑漂移）。

## DB

- **name**: `nexus-reader`
- **version**: 2（见 `nexus-reader/src/utils/db.ts`）

## Stores

### `progress`
- **keyPath**: `bookId`
- **value**: `ReadingProgress`
  - `bookId: string`
  - `chapterIndex: number`
  - `scrollPercent: number`
  - `updatedAt: number`
- **indexes**
  - `updatedAt`

### `syncQueue`
- **keyPath**: `id`
- **value**: `SyncTask`
  - `id: string`
  - `type: string`
  - `method: string`
  - `url: string`
  - `data?: unknown`
  - `priority: 'CRITICAL' | 'NORMAL' | 'IDLE'`
  - `timestamp: number`
  - `retryCount: number`
- **indexes**
  - `priority`
  - `timestamp`

### `offlineContent`
- **keyPath**: `id`
- **value**: `OfflineContent`
  - `id: string`
  - `type: 'chapter' | 'book' | 'image' | 'api-response'`
  - `url: string`
  - `data: unknown`
  - `timestamp: number`
  - `size: number`
  - `priority: number`
- **indexes**
  - `type`
  - `priority`

### 其它既有 stores
- `books`（keyPath `id`，indexes：`title/author/groupId`）
- `chapters`（keyPath `id`，indexes：`bookId/title`）
- `settings`（keyPath `key`）
- `cache`（keyPath `key`，indexes：`url/type`）

## 代码落点（需要保持一致）

- `nexus-reader/src/utils/db.ts`：`StoreNames` / `DBConfig` / `onupgradeneeded`
- `nexus-reader/src/services/syncManager.ts`：写入/消费 `syncQueue`
- `nexus-reader/src/services/progressSync.ts`：读写 `progress`
- `nexus-reader/src/services/offline/manager.ts`：读写 `offlineContent` 与 `syncQueue`

