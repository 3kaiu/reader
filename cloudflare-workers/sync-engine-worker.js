// Cloudflare Workers 同步引擎
// 处理多设备间的实时数据同步，使用KV存储用户数据

// KV命名空间绑定（需要在wrangler.toml中配置）
// USER_DATA_KV - 用户数据存储
// SYNC_METADATA_KV - 同步元数据存储

// 数据类型定义
const SyncDataTypes = {
  READING_PROGRESS: 'reading-progress',
  USER_PREFERENCES: 'user-preferences',
  BOOKMARKS: 'bookmarks',
  NOVEL_METADATA: 'novel-metadata'
};

const ConflictResolutionStrategies = {
  LAST_WRITE_WINS: 'last-write-wins',
  CLIENT_WINS: 'client-wins',
  SERVER_WINS: 'server-wins',
  MANUAL: 'manual'
};

// 主要的请求处理器
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // CORS处理
    if (request.method === 'OPTIONS') {
      return handleCORS();
    }
    
    try {
      // 路由处理
      if (path.startsWith('/api/sync/')) {
        return await handleSyncRequest(request, env, path);
      } else if (path.startsWith('/api/user/')) {
        return await handleUserRequest(request, env, path);
      } else if (path === '/api/sync/status') {
        return await handleSyncStatus(request, env);
      } else {
        return new Response('Not Found', { status: 404 });
      }
    } catch (error) {
      console.error('Sync Engine Error:', error);
      return new Response(JSON.stringify({
        error: 'Internal Server Error',
        message: error.message,
        timestamp: Date.now()
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};

// 处理同步请求
async function handleSyncRequest(request, env, path) {
  const method = request.method;
  const segments = path.split('/').filter(Boolean);
  
  // 验证用户身份
  const userId = await authenticateUser(request);
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  // 路由到具体的同步处理函数
  if (segments[2] === 'reading-progress') {
    return await handleReadingProgressSync(request, env, userId, method);
  } else if (segments[2] === 'user-preferences') {
    return await handleUserPreferencesSync(request, env, userId, method);
  } else if (segments[2] === 'bookmarks') {
    return await handleBookmarksSync(request, env, userId, method);
  } else if (segments[2] === 'batch') {
    return await handleBatchSync(request, env, userId, method);
  } else {
    return new Response('Invalid sync endpoint', { status: 400 });
  }
}

// 处理阅读进度同步
async function handleReadingProgressSync(request, env, userId, method) {
  const key = `user:${userId}:reading-progress`;
  
  switch (method) {
    case 'GET':
      return await getSyncData(env.USER_DATA_KV, key);
      
    case 'PUT':
    case 'POST':
      const progressData = await request.json();
      return await setSyncData(env, key, progressData, SyncDataTypes.READING_PROGRESS, userId);
      
    case 'DELETE':
      return await deleteSyncData(env.USER_DATA_KV, key);
      
    default:
      return new Response('Method not allowed', { status: 405 });
  }
}

// 处理用户偏好同步
async function handleUserPreferencesSync(request, env, userId, method) {
  const key = `user:${userId}:preferences`;
  
  switch (method) {
    case 'GET':
      return await getSyncData(env.USER_DATA_KV, key);
      
    case 'PUT':
    case 'POST':
      const preferencesData = await request.json();
      return await setSyncData(env, key, preferencesData, SyncDataTypes.USER_PREFERENCES, userId);
      
    case 'DELETE':
      return await deleteSyncData(env.USER_DATA_KV, key);
      
    default:
      return new Response('Method not allowed', { status: 405 });
  }
}

// 处理书签同步
async function handleBookmarksSync(request, env, userId, method) {
  const url = new URL(request.url);
  const bookmarkId = url.pathname.split('/').pop();
  
  switch (method) {
    case 'GET':
      if (bookmarkId && bookmarkId !== 'bookmarks') {
        // 获取单个书签
        const key = `user:${userId}:bookmark:${bookmarkId}`;
        return await getSyncData(env.USER_DATA_KV, key);
      } else {
        // 获取所有书签
        return await getAllBookmarks(env.USER_DATA_KV, userId);
      }
      
    case 'POST':
      const bookmarkData = await request.json();
      const newBookmarkId = bookmarkData.id || generateId();
      const key = `user:${userId}:bookmark:${newBookmarkId}`;
      return await setSyncData(env, key, bookmarkData, SyncDataTypes.BOOKMARKS, userId);
      
    case 'DELETE':
      if (bookmarkId) {
        const key = `user:${userId}:bookmark:${bookmarkId}`;
        return await deleteSyncData(env.USER_DATA_KV, key);
      } else {
        return new Response('Bookmark ID required', { status: 400 });
      }
      
    default:
      return new Response('Method not allowed', { status: 405 });
  }
}

// 处理批量同步
async function handleBatchSync(request, env, userId, method) {
  if (method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  
  const batchData = await request.json();
  const results = [];
  
  for (const item of batchData.items) {
    try {
      const key = `user:${userId}:${item.type}:${item.id || ''}`;
      const result = await setSyncData(env, key, item.data, item.type, userId);
      results.push({
        id: item.id,
        type: item.type,
        success: result.ok,
        timestamp: Date.now()
      });
    } catch (error) {
      results.push({
        id: item.id,
        type: item.type,
        success: false,
        error: error.message,
        timestamp: Date.now()
      });
    }
  }
  
  return new Response(JSON.stringify({
    results,
    totalProcessed: results.length,
    successCount: results.filter(r => r.success).length,
    failureCount: results.filter(r => !r.success).length
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

// 获取同步数据
async function getSyncData(kv, key) {
  try {
    const data = await kv.get(key, { type: 'json' });
    
    if (!data) {
      return new Response('Not found', { status: 404 });
    }
    
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Failed to get sync data:', error);
    return new Response('Internal server error', { status: 500 });
  }
}

// 设置同步数据（包含冲突检测）
async function setSyncData(env, key, newData, dataType, userId) {
  try {
    // 获取现有数据进行冲突检测
    const existingData = await env.USER_DATA_KV.get(key, { type: 'json' });
    
    let finalData = newData;
    let conflictResolved = false;
    
    if (existingData && existingData.lastModified) {
      // 检测冲突
      const conflict = detectConflict(existingData, newData);
      
      if (conflict.hasConflict) {
        // 解决冲突
        const resolution = await resolveConflict(
          existingData, 
          newData, 
          ConflictResolutionStrategies.LAST_WRITE_WINS
        );
        
        finalData = resolution.resolvedData;
        conflictResolved = true;
        
        // 记录冲突解决日志
        await logConflictResolution(env, userId, key, conflict, resolution);
      }
    }
    
    // 添加同步元数据
    const syncMetadata = {
      ...finalData,
      lastModified: Date.now(),
      syncVersion: (existingData?.syncVersion || 0) + 1,
      conflictResolved,
      dataType
    };
    
    // 保存到KV
    await env.USER_DATA_KV.put(key, JSON.stringify(syncMetadata));
    
    // 更新同步状态
    await updateSyncStatus(env, userId, dataType, Date.now());
    
    return new Response(JSON.stringify({
      success: true,
      data: syncMetadata,
      conflictResolved,
      timestamp: Date.now()
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Failed to set sync data:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// 删除同步数据
async function deleteSyncData(kv, key) {
  try {
    await kv.delete(key);
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Failed to delete sync data:', error);
    return new Response('Internal server error', { status: 500 });
  }
}

// 冲突检测
function detectConflict(existingData, newData) {
  const existingTimestamp = existingData.lastModified || 0;
  const newTimestamp = newData.lastModified || Date.now();
  
  // 简单的时间戳冲突检测
  const timeDiff = Math.abs(existingTimestamp - newTimestamp);
  const hasConflict = timeDiff < 5000; // 5秒内的更新视为潜在冲突
  
  return {
    hasConflict,
    existingTimestamp,
    newTimestamp,
    timeDiff,
    conflictType: hasConflict ? 'timestamp' : 'none'
  };
}

// 冲突解决
async function resolveConflict(existingData, newData, strategy) {
  switch (strategy) {
    case ConflictResolutionStrategies.LAST_WRITE_WINS:
      const existingTime = existingData.lastModified || 0;
      const newTime = newData.lastModified || Date.now();
      return {
        resolvedData: newTime > existingTime ? newData : existingData,
        strategy,
        winner: newTime > existingTime ? 'new' : 'existing',
        timestamp: Date.now()
      };
      
    case ConflictResolutionStrategies.CLIENT_WINS:
      return {
        resolvedData: newData,
        strategy,
        winner: 'client',
        timestamp: Date.now()
      };
      
    case ConflictResolutionStrategies.SERVER_WINS:
      return {
        resolvedData: existingData,
        strategy,
        winner: 'server',
        timestamp: Date.now()
      };
      
    default:
      // 默认使用最后写入获胜
      return await resolveConflict(existingData, newData, ConflictResolutionStrategies.LAST_WRITE_WINS);
  }
}

// 记录冲突解决日志
async function logConflictResolution(env, userId, key, conflict, resolution) {
  const logKey = `conflict-log:${userId}:${Date.now()}`;
  const logData = {
    userId,
    dataKey: key,
    conflict,
    resolution,
    timestamp: Date.now()
  };
  
  try {
    await env.SYNC_METADATA_KV.put(logKey, JSON.stringify(logData), {
      expirationTtl: 30 * 24 * 60 * 60 // 30天后过期
    });
  } catch (error) {
    console.error('Failed to log conflict resolution:', error);
  }
}

// 更新同步状态
async function updateSyncStatus(env, userId, dataType, timestamp) {
  const statusKey = `sync-status:${userId}`;
  
  try {
    const existingStatus = await env.SYNC_METADATA_KV.get(statusKey, { type: 'json' }) || {};
    
    const updatedStatus = {
      ...existingStatus,
      [dataType]: {
        lastSync: timestamp,
        syncCount: (existingStatus[dataType]?.syncCount || 0) + 1
      },
      lastActivity: timestamp
    };
    
    await env.SYNC_METADATA_KV.put(statusKey, JSON.stringify(updatedStatus));
  } catch (error) {
    console.error('Failed to update sync status:', error);
  }
}

// 获取所有书签
async function getAllBookmarks(kv, userId) {
  try {
    const listResult = await kv.list({ prefix: `user:${userId}:bookmark:` });
    const bookmarks = [];
    
    for (const key of listResult.keys) {
      const bookmark = await kv.get(key.name, { type: 'json' });
      if (bookmark) {
        bookmarks.push(bookmark);
      }
    }
    
    return new Response(JSON.stringify({
      bookmarks,
      count: bookmarks.length,
      timestamp: Date.now()
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Failed to get all bookmarks:', error);
    return new Response('Internal server error', { status: 500 });
  }
}

// 处理同步状态查询
async function handleSyncStatus(request, env) {
  const userId = await authenticateUser(request);
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  try {
    const statusKey = `sync-status:${userId}`;
    const status = await env.SYNC_METADATA_KV.get(statusKey, { type: 'json' });
    
    return new Response(JSON.stringify({
      userId,
      status: status || {},
      timestamp: Date.now()
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Failed to get sync status:', error);
    return new Response('Internal server error', { status: 500 });
  }
}

// 用户认证（简化版本）
async function authenticateUser(request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.substring(7);
  
  // 这里应该实现真正的JWT验证
  // 现在使用简化版本进行演示
  try {
    // 假设token就是userId（实际应用中需要JWT解码和验证）
    return token.length > 0 ? token : null;
  } catch (error) {
    return null;
  }
}

// 处理CORS
function handleCORS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    }
  });
}

// 生成唯一ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// 处理用户请求
async function handleUserRequest(request, env, path) {
  // 用户相关的API端点处理
  return new Response('User API not implemented yet', { status: 501 });
}