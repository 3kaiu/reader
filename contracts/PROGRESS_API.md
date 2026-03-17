# Progress API contract

用于前端 `progressSync` 与 Worker `/progress/*` 的统一接口契约。

## Endpoint

- Base: `VITE_PROGRESS_SYNC_URL`（前端环境变量）
- Path: `/progress/:bookId`

## Auth

- Header: `Authorization: Bearer <token>`（token 来自 Worker `/auth/github/callback` 回跳后落地到前端）

## Models

```json
{
  "bookId": "string",
  "chapterIndex": 0,
  "scrollPercent": 0,
  "updatedAt": 0
}
```

## Methods

### `PUT /progress/:bookId`

- **request body**（允许最小更新；server 会补齐 `bookId/updatedAt`）

```json
{
  "chapterIndex": 12,
  "scrollPercent": 42.5
}
```

- **response**: `200 {"success": true}`

### `GET /progress/:bookId`

- **response**
  - `200`：返回 Progress JSON（见 Models）
  - `404`：`{"error": "Not Found"}`

### `DELETE /progress/:bookId`

- **response**: `200 {"success": true}`

