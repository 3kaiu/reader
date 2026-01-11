# API 文档 (API Documentation)

## 概述 (Overview)

Nexus Reader API 提供了完整的 RESTful 接口，支持用户管理、内容管理、同步服务、AI 功能等核心特性。所有 API 都通过 Cloudflare Workers 在边缘节点处理，确保全球低延迟访问。

## 基础信息 (Base Information)

- **Base URL**: `https://api.nexus-reader.example.com`
- **API Version**: `v1`
- **Content Type**: `application/json`
- **Authentication**: Bearer Token

## 认证 (Authentication)

### 获取访问令牌 (Get Access Token)

```http
POST /api/auth/login
Content-Type: application/json

{
  "deviceId": "string",
  "deviceName": "string"
}
```

**响应 (Response)**:
```json
{
  "success": true,
  "data": {
    "accessToken": "string",
    "refreshToken": "string",
    "expiresIn": 3600,
    "user": {
      "id": "string",
      "deviceId": "string",
      "createdAt": "2024-01-01T00:00:00Z"
    }
  }
}
```

### 刷新令牌 (Refresh Token)

```http
POST /api/auth/refresh
Content-Type: application/json
Authorization: Bearer <refresh_token>

{
  "refreshToken": "string"
}
```

## 用户管理 (User Management)

### 获取用户资料 (Get User Profile)

```http
GET /api/user/profile
Authorization: Bearer <access_token>
```

**响应 (Response)**:
```json
{
  "success": true,
  "data": {
    "id": "string",
    "deviceId": "string",
    "preferences": {
      "theme": "light|dark|auto",
      "fontSize": 16,
      "fontFamily": "string",
      "readingMode": "scroll|page",
      "autoSync": true
    },
    "stats": {
      "totalReadingTime": 3600,
      "booksRead": 10,
      "currentStreak": 5
    },
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  }
}
```

### 更新用户偏好 (Update User Preferences)

```http
PUT /api/user/preferences
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "theme": "dark",
  "fontSize": 18,
  "fontFamily": "serif",
  "readingMode": "scroll",
  "autoSync": true
}
```

## 内容管理 (Content Management)

### 获取小说列表 (Get Novels List)

```http
GET /api/novels?page=1&limit=20&category=fantasy&sort=updated
Authorization: Bearer <access_token>
```

**查询参数 (Query Parameters)**:
- `page` (optional): 页码，默认 1
- `limit` (optional): 每页数量，默认 20，最大 100
- `category` (optional): 分类筛选
- `sort` (optional): 排序方式 (`updated`, `created`, `title`, `author`)
- `search` (optional): 搜索关键词

**响应 (Response)**:
```json
{
  "success": true,
  "data": {
    "novels": [
      {
        "id": "string",
        "title": "string",
        "author": "string",
        "description": "string",
        "coverUrl": "string",
        "category": "string",
        "tags": ["string"],
        "aiTags": ["string"],
        "chapterCount": 100,
        "wordCount": 500000,
        "status": "ongoing|completed",
        "lastUpdated": "2024-01-01T00:00:00Z",
        "createdAt": "2024-01-01T00:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "totalPages": 5
    }
  }
}
```

### 获取小说详情 (Get Novel Details)

```http
GET /api/novels/{novelId}
Authorization: Bearer <access_token>
```

**响应 (Response)**:
```json
{
  "success": true,
  "data": {
    "id": "string",
    "title": "string",
    "author": "string",
    "description": "string",
    "coverUrl": "string",
    "category": "string",
    "tags": ["string"],
    "aiTags": ["string"],
    "chapters": [
      {
        "id": "string",
        "title": "string",
        "chapterNumber": 1,
        "wordCount": 5000,
        "readingTime": 20,
        "publishedAt": "2024-01-01T00:00:00Z"
      }
    ],
    "metadata": {
      "language": "zh-CN",
      "genre": "fantasy",
      "rating": 4.5,
      "reviewCount": 100
    },
    "stats": {
      "totalChapters": 100,
      "totalWords": 500000,
      "averageChapterLength": 5000,
      "estimatedReadingTime": 2000
    },
    "readingProgress": {
      "currentChapter": 10,
      "currentPosition": 0.5,
      "lastReadAt": "2024-01-01T00:00:00Z"
    }
  }
}
```

### 上传小说 (Upload Novel)

```http
POST /api/novels
Authorization: Bearer <access_token>
Content-Type: multipart/form-data

{
  "file": <file>,
  "title": "string",
  "author": "string",
  "description": "string",
  "category": "string",
  "tags": ["string"]
}
```

### 获取章节内容 (Get Chapter Content)

```http
GET /api/novels/{novelId}/chapters/{chapterId}
Authorization: Bearer <access_token>
```

**响应 (Response)**:
```json
{
  "success": true,
  "data": {
    "id": "string",
    "novelId": "string",
    "title": "string",
    "chapterNumber": 1,
    "content": "string",
    "wordCount": 5000,
    "readingTime": 20,
    "publishedAt": "2024-01-01T00:00:00Z",
    "navigation": {
      "previousChapter": "string|null",
      "nextChapter": "string|null"
    }
  }
}
```

## 同步服务 (Sync Service)

### 同步阅读进度 (Sync Reading Progress)

```http
POST /api/sync/progress
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "novelId": "string",
  "chapterId": "string",
  "position": 0.5,
  "timestamp": "2024-01-01T00:00:00Z"
}
```

**响应 (Response)**:
```json
{
  "success": true,
  "data": {
    "synced": true,
    "conflictResolved": false,
    "syncTimestamp": "2024-01-01T00:00:00Z"
  }
}
```

### 获取同步状态 (Get Sync Status)

```http
GET /api/sync/status
Authorization: Bearer <access_token>
```

**响应 (Response)**:
```json
{
  "success": true,
  "data": {
    "lastSyncAt": "2024-01-01T00:00:00Z",
    "pendingChanges": 0,
    "conflictCount": 0,
    "devices": [
      {
        "deviceId": "string",
        "deviceName": "string",
        "lastActiveAt": "2024-01-01T00:00:00Z",
        "syncStatus": "synced|pending|conflict"
      }
    ]
  }
}
```

### 同步书签 (Sync Bookmarks)

```http
POST /api/sync/bookmarks
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "novelId": "string",
  "chapterId": "string",
  "bookmarks": [
    {
      "id": "string",
      "position": 0.3,
      "note": "string",
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

## AI 功能 (AI Features)

### 获取推荐 (Get Recommendations)

```http
GET /api/ai/recommendations?limit=10&type=similar
Authorization: Bearer <access_token>
```

**查询参数 (Query Parameters)**:
- `limit` (optional): 推荐数量，默认 10
- `type` (optional): 推荐类型 (`similar`, `trending`, `personalized`)
- `novelId` (optional): 基于特定小说的推荐

**响应 (Response)**:
```json
{
  "success": true,
  "data": {
    "recommendations": [
      {
        "novel": {
          "id": "string",
          "title": "string",
          "author": "string",
          "coverUrl": "string",
          "rating": 4.5
        },
        "score": 0.95,
        "reason": "基于您的阅读历史推荐",
        "tags": ["fantasy", "adventure"]
      }
    ],
    "metadata": {
      "algorithm": "collaborative_filtering",
      "generatedAt": "2024-01-01T00:00:00Z"
    }
  }
}
```

### 语义搜索 (Semantic Search)

```http
POST /api/ai/search
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "query": "关于魔法学院的小说",
  "limit": 20,
  "filters": {
    "category": "fantasy",
    "minRating": 4.0
  }
}
```

**响应 (Response)**:
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "novel": {
          "id": "string",
          "title": "string",
          "author": "string",
          "description": "string",
          "coverUrl": "string"
        },
        "relevanceScore": 0.92,
        "matchedConcepts": ["魔法", "学院", "奇幻"],
        "snippet": "...相关内容片段..."
      }
    ],
    "query": {
      "original": "关于魔法学院的小说",
      "processed": "magic academy fantasy novel",
      "concepts": ["magic", "academy", "fantasy"]
    },
    "metadata": {
      "totalResults": 50,
      "searchTime": 0.15
    }
  }
}
```

### 内容分类 (Content Classification)

```http
POST /api/ai/classify
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "novelId": "string",
  "content": "string"
}
```

**响应 (Response)**:
```json
{
  "success": true,
  "data": {
    "categories": [
      {
        "name": "fantasy",
        "confidence": 0.95
      },
      {
        "name": "adventure",
        "confidence": 0.87
      }
    ],
    "tags": [
      {
        "tag": "magic",
        "confidence": 0.92
      },
      {
        "tag": "hero_journey",
        "confidence": 0.88
      }
    ],
    "sentiment": {
      "positive": 0.7,
      "neutral": 0.2,
      "negative": 0.1
    },
    "metadata": {
      "model": "content-classifier-v2",
      "processedAt": "2024-01-01T00:00:00Z"
    }
  }
}
```

## 分析和监控 (Analytics & Monitoring)

### 获取分析数据 (Get Analytics)

```http
GET /api/analytics/dashboard?period=7d
Authorization: Bearer <access_token>
```

**查询参数 (Query Parameters)**:
- `period`: 时间周期 (`1d`, `7d`, `30d`, `90d`)
- `metrics`: 指标类型 (`performance`, `usage`, `errors`)

**响应 (Response)**:
```json
{
  "success": true,
  "data": {
    "performance": {
      "averageLoadTime": 0.8,
      "cacheHitRate": 0.96,
      "errorRate": 0.005
    },
    "usage": {
      "totalSessions": 1500,
      "uniqueUsers": 300,
      "averageSessionDuration": 1800,
      "pagesPerSession": 15
    },
    "resources": {
      "workerRequests": 45000,
      "kvReads": 12000,
      "kvWrites": 3000,
      "storageUsed": "450MB"
    },
    "trends": [
      {
        "date": "2024-01-01",
        "sessions": 200,
        "loadTime": 0.75
      }
    ]
  }
}
```

### 健康检查 (Health Check)

```http
GET /api/health
```

**响应 (Response)**:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-01T00:00:00Z",
    "components": {
      "api": {
        "status": "healthy",
        "responseTime": 45
      },
      "database": {
        "status": "healthy",
        "responseTime": 12
      },
      "storage": {
        "status": "healthy",
        "usage": 0.45
      },
      "ai_service": {
        "status": "healthy",
        "responseTime": 120
      }
    },
    "metrics": {
      "uptime": 99.9,
      "memoryUsage": 0.65,
      "cpuUsage": 0.25
    }
  }
}
```

## 错误处理 (Error Handling)

### 错误响应格式 (Error Response Format)

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "请求参数验证失败",
    "details": {
      "field": "email",
      "reason": "格式不正确"
    },
    "timestamp": "2024-01-01T00:00:00Z",
    "requestId": "req_123456789"
  }
}
```

### 常见错误代码 (Common Error Codes)

| 错误代码 | HTTP 状态码 | 描述 |
|---------|------------|------|
| `AUTHENTICATION_REQUIRED` | 401 | 需要身份验证 |
| `INVALID_TOKEN` | 401 | 无效的访问令牌 |
| `TOKEN_EXPIRED` | 401 | 访问令牌已过期 |
| `INSUFFICIENT_PERMISSIONS` | 403 | 权限不足 |
| `RESOURCE_NOT_FOUND` | 404 | 资源不存在 |
| `VALIDATION_ERROR` | 400 | 请求参数验证失败 |
| `RATE_LIMIT_EXCEEDED` | 429 | 请求频率超限 |
| `INTERNAL_SERVER_ERROR` | 500 | 服务器内部错误 |
| `SERVICE_UNAVAILABLE` | 503 | 服务暂时不可用 |

## 速率限制 (Rate Limiting)

### 限制规则 (Rate Limits)

| 端点类型 | 限制 | 时间窗口 |
|---------|------|---------|
| 认证相关 | 10 请求 | 1 分钟 |
| 内容读取 | 1000 请求 | 1 小时 |
| 内容上传 | 10 请求 | 1 小时 |
| AI 功能 | 100 请求 | 1 小时 |
| 搜索 | 200 请求 | 1 小时 |

### 响应头 (Response Headers)

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1640995200
```

## SDK 和示例 (SDKs & Examples)

### JavaScript/TypeScript SDK

```typescript
import { NexusReaderAPI } from '@nexus-reader/sdk';

const api = new NexusReaderAPI({
  baseURL: 'https://api.nexus-reader.example.com',
  accessToken: 'your-access-token'
});

// 获取小说列表
const novels = await api.novels.list({
  page: 1,
  limit: 20,
  category: 'fantasy'
});

// 获取推荐
const recommendations = await api.ai.getRecommendations({
  limit: 10,
  type: 'personalized'
});

// 同步阅读进度
await api.sync.updateProgress({
  novelId: 'novel-123',
  chapterId: 'chapter-456',
  position: 0.5
});
```

### Python SDK

```python
from nexus_reader import NexusReaderAPI

api = NexusReaderAPI(
    base_url='https://api.nexus-reader.example.com',
    access_token='your-access-token'
)

# 获取小说列表
novels = api.novels.list(page=1, limit=20, category='fantasy')

# 语义搜索
results = api.ai.semantic_search(
    query='关于魔法学院的小说',
    limit=20
)

# 获取分析数据
analytics = api.analytics.get_dashboard(period='7d')
```

## Webhook 事件 (Webhook Events)

### 配置 Webhook

```http
POST /api/webhooks
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "url": "https://your-app.com/webhooks/nexus-reader",
  "events": ["novel.updated", "sync.completed"],
  "secret": "your-webhook-secret"
}
```

### 事件类型 (Event Types)

#### 小说更新 (Novel Updated)
```json
{
  "event": "novel.updated",
  "timestamp": "2024-01-01T00:00:00Z",
  "data": {
    "novelId": "string",
    "changes": ["chapters", "metadata"],
    "newChapters": 5
  }
}
```

#### 同步完成 (Sync Completed)
```json
{
  "event": "sync.completed",
  "timestamp": "2024-01-01T00:00:00Z",
  "data": {
    "userId": "string",
    "deviceId": "string",
    "syncedItems": 10,
    "conflicts": 0
  }
}
```

## 版本控制 (Versioning)

API 使用语义化版本控制，当前版本为 `v1`。

### 版本兼容性 (Version Compatibility)
- **主版本**: 不兼容的 API 更改
- **次版本**: 向后兼容的功能添加
- **补丁版本**: 向后兼容的错误修复

### 版本迁移 (Version Migration)
当发布新的主版本时，旧版本将继续支持 6 个月，以便用户有足够时间迁移。

---

## 支持 (Support)

如有 API 相关问题，请：
1. 查看 [常见问题](FAQ.md)
2. 检查 [状态页面](https://status.nexus-reader.example.com)
3. 提交 [Issue](../../issues/new)
4. 联系技术支持