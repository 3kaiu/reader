# TODO 项跟踪清单

> 从代码中提取的 TODO 项，需要创建 GitHub Issues 或决定是否删除

## 📋 待处理 TODO 列表

### 1. novel-decoder-worker.ts - 拼音索引功能

**位置**: `cloudflare-workers/novel-decoder-worker.ts:388-389`

```typescript
// TODO: 拼音索引 (需要 pinyin-pro)
// TODO: 首字母索引
```

**状态**: 🟡 待评估  
**优先级**: P3 - 低  
**建议**: 
- 评估是否真的需要拼音索引功能
- 如果需要，创建 Issue 并引入 pinyin-pro 库
- 如果不需要，删除 TODO 注释

**预估工作量**: 2-3 天

---

### 2. novel-decoder-worker.ts - 自动提升到分类词典

**位置**: `cloudflare-workers/novel-decoder-worker.ts:1667-1668`

```typescript
// Implement auto-promotion logic
const decoder = new DecoderEngine(env);
const promotionManager = decoder.getPromotionManager();
if (fullEntry.categoryTags && fullEntry.categoryTags.length > 0) {
  await promotionManager.promoteToCategory(fullEntry, fullEntry.categoryTags[0]);
}
```

**状态**: ✅ 已完成  
**优先级**: P2 - 中  
**完成日期**: 2025-01-15  
**说明**: 
- 已实现自动提升逻辑
- 当词条确认次数达到阈值时自动提升到分类词典
- 调用 `promotionManager.promoteToCategory()` 方法
- 包含错误处理和日志记录

**预估工作量**: 1 天

---

### 3. voice-settings.vue - TTS 测试功能

**位置**: `nexus-reader/src/pages/voice-settings.vue:181-183`

```typescript
// TODO: 实际调用 TTS 生成音频
await new Promise((resolve) => setTimeout(resolve, 1000));
success("测试功能开发中，请稍后");
```

**状态**: 🔴 需要实现  
**优先级**: P2 - 中  
**建议**: 
- 实现 TTS 测试功能
- 调用 TTS 服务生成测试音频
- 播放生成的音频

**预估工作量**: 2 天

---

### 4. decoder-dictionary.vue - 删除词条 API

**位置**: `nexus-reader/src/pages/decoder-dictionary.vue:230-232`

```typescript
// 已实现删除 API
await decoder.deleteDictionaryEntry(entry.id, {
  level: entry.level,
  bookId: entry.bookId,
  category: entry.category,
})
```

**状态**: ✅ 已完成  
**优先级**: P2 - 中  
**完成日期**: 2025-01-15  
**说明**: 
- 已在 novel-decoder-worker.ts 中添加 DELETE /dictionary/:id 端点
- 前端调用该 API 并包含错误处理
- 添加加载状态和用户反馈

**预估工作量**: 1 天

---

### 5. decoder-dictionary.vue - 批量删除 API

**位置**: `nexus-reader/src/pages/decoder-dictionary.vue:270-272`

```typescript
// 已实现批量删除 API
const response = await decoder.batchDeleteDictionaryEntries({
  ids,
  level: firstEntry?.level,
  bookId: firstEntry?.bookId,
  category: firstEntry?.category,
})
```

**状态**: ✅ 已完成  
**优先级**: P2 - 中  
**完成日期**: 2025-01-15  
**说明**: 
- 已在 novel-decoder-worker.ts 中添加 DELETE /dictionary/batch 端点
- 前端调用该 API 并处理部分成功场景
- 添加错误处理和用户反馈

**预估工作量**: 1 天

---

### 6. sources.vue - 书源状态保存

**位置**: `nexus-reader/src/pages/sources.vue:149-151`

```typescript
async function toggleEnable(source: BookSource, newValue: boolean) {
  const previousValue = source.enabled;
  source.enabled = newValue;
  
  try {
    await sourceApi.updateSourceStatus(source.id, newValue);
    success(newValue ? '已启用书源' : '已禁用书源');
  } catch (e) {
    source.enabled = previousValue;
    handlePromiseError(e, '更新书源状态失败');
  }
}
```

**状态**: ✅ 已完成  
**优先级**: P2 - 中  
**完成日期**: 2025-01-15  
**说明**: 
- 已在 Nexus Lite 中添加 PUT /api/sources/:id/status 端点
- 使用 sled 数据库的 source_status tree 存储状态
- 前端调用该 API 并包含状态回滚机制
- 添加错误处理和用户反馈

**预估工作量**: 1-2 天

---

### 7. errorLogger.ts - 外部日志服务集成

**位置**: `nexus-reader/src/utils/errorLogger.ts:408-410`

```typescript
private async sendToExternalLogging(_error: ErrorEntry): Promise<void> {
  // TODO: 实现外部日志服务集成
  // 当前后端无对应端点，暂时禁用
}
```

**状态**: 🟡 待评估  
**优先级**: P3 - 低  
**建议**: 
- 评估是否需要外部日志服务（如 Sentry, LogRocket）
- 如果需要，集成相应服务
- 如果不需要，删除该方法

**预估工作量**: 2-3 天（取决于选择的服务）

---

### 8. performance.ts - web-vitals 库

**位置**: `nexus-reader/src/utils/performance.ts:86-88`

```typescript
// TODO: 之后可以引入 web-vitals 库
// 简单实现 LCP 监听
```

**状态**: 🟡 待评估  
**优先级**: P3 - 低  
**建议**: 
- 评估当前性能监控是否足够
- 如果需要更详细的指标，引入 web-vitals
- 如果不需要，删除 TODO 注释

**预估工作量**: 1 天

---

## 📊 统计

- **总计**: 8 个 TODO
- **已完成**: 4 个 (✅)
- **需要实现**: 1 个（P2）
- **待评估**: 3 个（P3）

## 🎯 建议处理顺序

### 第一批（高价值，快速完成）
1. ✅ 自动提升到分类词典（1 天）- 已完成
2. ⏳ 删除词条 API（1 天）
3. ⏳ 批量删除 API（1 天）

### 第二批（完善功能）
4. ⏳ TTS 测试功能（2 天）
5. ⏳ 书源状态保存（1-2 天）

### 第三批（可选优化）
6. 🔍 评估拼音索引需求
7. 🔍 评估外部日志服务需求
8. 🔍 评估 web-vitals 需求

---

**创建日期**: 2025-01-15  
**最后更新**: 2025-01-15
