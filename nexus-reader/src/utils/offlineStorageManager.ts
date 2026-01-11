// 离线存储管理器 - 处理IndexedDB操作和离线数据管理

interface NovelData {
  id: string;
  title: string;
  author: string;
  description: string;
  coverUrl?: string;
  chapters: ChapterData[];
  metadata: NovelMetadata;
  lastUpdated: number;
  downloadedAt: number;
  size: number;
}

interface ChapterData {
  id: string;
  novelId: string;
  title: string;
  content: string;
  wordCount: number;
  readingTime: number;
  order: number;
}

interface ReadingProgress {
  novelId: string;
  chapterId: string;
  position: number;
  percentage: number;
  lastRead: number;
  totalReadingTime: number;
  bookmarks: Bookmark[];
}

interface Bookmark {
  id: string;
  novelId: string;
  chapterId: string;
  position: number;
  note?: string;
  createdAt: number;
}

interface UserPreferences {
  key: string;
  value: any;
  lastModified: number;
  syncStatus: 'pending' | 'synced' | 'conflict';
}

interface SyncQueueItem {
  id?: number;
  type: 'reading-progress' | 'user-preferences' | 'bookmark' | 'novel-metadata';
  action: 'create' | 'update' | 'delete';
  data: any;
  timestamp: number;
  retryCount: number;
  priority: 'high' | 'medium' | 'low';
}

interface NovelMetadata {
  genre: string[];
  tags: string[];
  language: string;
  status: 'ongoing' | 'completed' | 'hiatus';
  rating: number;
  totalChapters: number;
  lastChapterUpdate: number;
}

class OfflineStorageManager {
  private db: IDBDatabase | null = null;
  private readonly dbName = 'NexusReaderDB';
  private readonly dbVersion = 2;
  private readonly maxStorageSize = 500 * 1024 * 1024; // 500MB
  private readonly maxNovels = 100;

  constructor() {
    this.initializeDB();
  }

  // 初始化IndexedDB
  async initializeDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('IndexedDB initialized successfully');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        this.createObjectStores(db);
      };
    });
  }

  // 创建对象存储
  private createObjectStores(db: IDBDatabase): void {
    // 小说存储
    if (!db.objectStoreNames.contains('novels')) {
      const novelStore = db.createObjectStore('novels', { keyPath: 'id' });
      novelStore.createIndex('title', 'title', { unique: false });
      novelStore.createIndex('author', 'author', { unique: false });
      novelStore.createIndex('downloadedAt', 'downloadedAt', { unique: false });
      novelStore.createIndex('lastUpdated', 'lastUpdated', { unique: false });
    }

    // 章节存储
    if (!db.objectStoreNames.contains('chapters')) {
      const chapterStore = db.createObjectStore('chapters', { keyPath: 'id' });
      chapterStore.createIndex('novelId', 'novelId', { unique: false });
      chapterStore.createIndex('order', 'order', { unique: false });
    }

    // 阅读进度存储
    if (!db.objectStoreNames.contains('readingProgress')) {
      const progressStore = db.createObjectStore('readingProgress', { keyPath: 'novelId' });
      progressStore.createIndex('lastRead', 'lastRead', { unique: false });
      progressStore.createIndex('chapterId', 'chapterId', { unique: false });
    }

    // 书签存储
    if (!db.objectStoreNames.contains('bookmarks')) {
      const bookmarkStore = db.createObjectStore('bookmarks', { keyPath: 'id' });
      bookmarkStore.createIndex('novelId', 'novelId', { unique: false });
      bookmarkStore.createIndex('chapterId', 'chapterId', { unique: false });
      bookmarkStore.createIndex('createdAt', 'createdAt', { unique: false });
    }

    // 用户偏好存储
    if (!db.objectStoreNames.contains('userPreferences')) {
      const prefStore = db.createObjectStore('userPreferences', { keyPath: 'key' });
      prefStore.createIndex('lastModified', 'lastModified', { unique: false });
      prefStore.createIndex('syncStatus', 'syncStatus', { unique: false });
    }

    // 同步队列存储
    if (!db.objectStoreNames.contains('syncQueue')) {
      const syncStore = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
      syncStore.createIndex('type', 'type', { unique: false });
      syncStore.createIndex('timestamp', 'timestamp', { unique: false });
      syncStore.createIndex('priority', 'priority', { unique: false });
    }

    // 缓存元数据存储
    if (!db.objectStoreNames.contains('cacheMetadata')) {
      const cacheStore = db.createObjectStore('cacheMetadata', { keyPath: 'key' });
      cacheStore.createIndex('lastAccessed', 'lastAccessed', { unique: false });
      cacheStore.createIndex('size', 'size', { unique: false });
    }
  }

  // 小说管理方法
  async saveNovel(novel: NovelData): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // 检查存储空间
    await this.checkStorageQuota();

    const transaction = this.db.transaction(['novels', 'chapters'], 'readwrite');
    const novelStore = transaction.objectStore('novels');
    const chapterStore = transaction.objectStore('chapters');

    try {
      // 保存小说元数据
      const novelToSave = {
        ...novel,
        downloadedAt: Date.now(),
        size: this.calculateNovelSize(novel)
      };
      
      await this.promisifyRequest(novelStore.put(novelToSave));

      // 保存章节内容
      for (const chapter of novel.chapters) {
        await this.promisifyRequest(chapterStore.put(chapter));
      }

      // 更新缓存元数据
      await this.updateCacheMetadata('novel', novel.id, novelToSave.size);

      console.log(`Novel ${novel.id} saved offline successfully`);
    } catch (error) {
      console.error('Failed to save novel:', error);
      throw error;
    }
  }

  async getNovel(novelId: string): Promise<NovelData | null> {
    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction(['novels', 'chapters'], 'readonly');
    const novelStore = transaction.objectStore('novels');
    const chapterStore = transaction.objectStore('chapters');

    try {
      const novel = await this.promisifyRequest(novelStore.get(novelId));
      if (!novel) return null;

      // 获取章节
      const chaptersRequest = chapterStore.index('novelId').getAll(novelId);
      const chapters = await this.promisifyRequest(chaptersRequest);

      // 按顺序排序章节
      chapters.sort((a, b) => a.order - b.order);

      return {
        ...novel,
        chapters
      };
    } catch (error) {
      console.error('Failed to get novel:', error);
      return null;
    }
  }

  async getAllNovels(): Promise<NovelData[]> {
    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction(['novels'], 'readonly');
    const store = transaction.objectStore('novels');

    try {
      const novels = await this.promisifyRequest(store.getAll());
      return novels.sort((a, b) => b.downloadedAt - a.downloadedAt);
    } catch (error) {
      console.error('Failed to get all novels:', error);
      return [];
    }
  }

  async deleteNovel(novelId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction(['novels', 'chapters', 'readingProgress', 'bookmarks'], 'readwrite');

    try {
      // 删除小说
      await this.promisifyRequest(transaction.objectStore('novels').delete(novelId));

      // 删除章节
      const chapterStore = transaction.objectStore('chapters');
      const chapterIndex = chapterStore.index('novelId');
      const chapterKeys = await this.promisifyRequest(chapterIndex.getAllKeys(novelId));
      
      for (const key of chapterKeys) {
        await this.promisifyRequest(chapterStore.delete(key));
      }

      // 删除阅读进度
      await this.promisifyRequest(transaction.objectStore('readingProgress').delete(novelId));

      // 删除书签
      const bookmarkStore = transaction.objectStore('bookmarks');
      const bookmarkIndex = bookmarkStore.index('novelId');
      const bookmarkKeys = await this.promisifyRequest(bookmarkIndex.getAllKeys(novelId));
      
      for (const key of bookmarkKeys) {
        await this.promisifyRequest(bookmarkStore.delete(key));
      }

      // 更新缓存元数据
      await this.removeCacheMetadata('novel', novelId);

      console.log(`Novel ${novelId} deleted successfully`);
    } catch (error) {
      console.error('Failed to delete novel:', error);
      throw error;
    }
  }

  // 阅读进度管理
  async saveReadingProgress(progress: ReadingProgress): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction(['readingProgress'], 'readwrite');
    const store = transaction.objectStore('readingProgress');

    try {
      await this.promisifyRequest(store.put(progress));
      
      // 添加到同步队列
      await this.addToSyncQueue({
        type: 'reading-progress',
        action: 'update',
        data: progress,
        timestamp: Date.now(),
        retryCount: 0,
        priority: 'high'
      });

      console.log(`Reading progress saved for novel ${progress.novelId}`);
    } catch (error) {
      console.error('Failed to save reading progress:', error);
      throw error;
    }
  }

  async getReadingProgress(novelId: string): Promise<ReadingProgress | null> {
    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction(['readingProgress'], 'readonly');
    const store = transaction.objectStore('readingProgress');

    try {
      const progress = await this.promisifyRequest(store.get(novelId));
      return progress || null;
    } catch (error) {
      console.error('Failed to get reading progress:', error);
      return null;
    }
  }

  async getAllReadingProgress(): Promise<ReadingProgress[]> {
    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction(['readingProgress'], 'readonly');
    const store = transaction.objectStore('readingProgress');

    try {
      const progressList = await this.promisifyRequest(store.getAll());
      return progressList.sort((a, b) => b.lastRead - a.lastRead);
    } catch (error) {
      console.error('Failed to get all reading progress:', error);
      return [];
    }
  }

  // 书签管理
  async saveBookmark(bookmark: Bookmark): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction(['bookmarks'], 'readwrite');
    const store = transaction.objectStore('bookmarks');

    try {
      await this.promisifyRequest(store.put(bookmark));
      
      // 添加到同步队列
      await this.addToSyncQueue({
        type: 'bookmark',
        action: 'create',
        data: bookmark,
        timestamp: Date.now(),
        retryCount: 0,
        priority: 'medium'
      });

      console.log(`Bookmark saved: ${bookmark.id}`);
    } catch (error) {
      console.error('Failed to save bookmark:', error);
      throw error;
    }
  }

  async getBookmarks(novelId: string): Promise<Bookmark[]> {
    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction(['bookmarks'], 'readonly');
    const store = transaction.objectStore('bookmarks');
    const index = store.index('novelId');

    try {
      const bookmarks = await this.promisifyRequest(index.getAll(novelId));
      return bookmarks.sort((a, b) => a.createdAt - b.createdAt);
    } catch (error) {
      console.error('Failed to get bookmarks:', error);
      return [];
    }
  }

  async deleteBookmark(bookmarkId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction(['bookmarks'], 'readwrite');
    const store = transaction.objectStore('bookmarks');

    try {
      await this.promisifyRequest(store.delete(bookmarkId));
      
      // 添加到同步队列
      await this.addToSyncQueue({
        type: 'bookmark',
        action: 'delete',
        data: { id: bookmarkId },
        timestamp: Date.now(),
        retryCount: 0,
        priority: 'medium'
      });

      console.log(`Bookmark deleted: ${bookmarkId}`);
    } catch (error) {
      console.error('Failed to delete bookmark:', error);
      throw error;
    }
  }

  // 用户偏好管理
  async saveUserPreference(key: string, value: any): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction(['userPreferences'], 'readwrite');
    const store = transaction.objectStore('userPreferences');

    const preference: UserPreferences = {
      key,
      value,
      lastModified: Date.now(),
      syncStatus: 'pending'
    };

    try {
      await this.promisifyRequest(store.put(preference));
      
      // 添加到同步队列
      await this.addToSyncQueue({
        type: 'user-preferences',
        action: 'update',
        data: preference,
        timestamp: Date.now(),
        retryCount: 0,
        priority: 'low'
      });

      console.log(`User preference saved: ${key}`);
    } catch (error) {
      console.error('Failed to save user preference:', error);
      throw error;
    }
  }

  async getUserPreference(key: string): Promise<any> {
    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction(['userPreferences'], 'readonly');
    const store = transaction.objectStore('userPreferences');

    try {
      const preference = await this.promisifyRequest(store.get(key));
      return preference ? preference.value : null;
    } catch (error) {
      console.error('Failed to get user preference:', error);
      return null;
    }
  }

  async getAllUserPreferences(): Promise<Record<string, any>> {
    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction(['userPreferences'], 'readonly');
    const store = transaction.objectStore('userPreferences');

    try {
      const preferences = await this.promisifyRequest(store.getAll());
      const result: Record<string, any> = {};
      
      preferences.forEach(pref => {
        result[pref.key] = pref.value;
      });

      return result;
    } catch (error) {
      console.error('Failed to get all user preferences:', error);
      return {};
    }
  }

  // 同步队列管理
  async addToSyncQueue(item: Omit<SyncQueueItem, 'id'>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction(['syncQueue'], 'readwrite');
    const store = transaction.objectStore('syncQueue');

    try {
      await this.promisifyRequest(store.add(item));
    } catch (error) {
      console.error('Failed to add to sync queue:', error);
      throw error;
    }
  }

  async getSyncQueue(): Promise<SyncQueueItem[]> {
    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction(['syncQueue'], 'readonly');
    const store = transaction.objectStore('syncQueue');

    try {
      const items = await this.promisifyRequest(store.getAll());
      return items.sort((a, b) => {
        // 按优先级和时间戳排序
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        return priorityDiff !== 0 ? priorityDiff : a.timestamp - b.timestamp;
      });
    } catch (error) {
      console.error('Failed to get sync queue:', error);
      return [];
    }
  }

  async removeSyncQueueItem(id: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction(['syncQueue'], 'readwrite');
    const store = transaction.objectStore('syncQueue');

    try {
      await this.promisifyRequest(store.delete(id));
    } catch (error) {
      console.error('Failed to remove sync queue item:', error);
      throw error;
    }
  }

  async clearSyncQueue(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction(['syncQueue'], 'readwrite');
    const store = transaction.objectStore('syncQueue');

    try {
      await this.promisifyRequest(store.clear());
      console.log('Sync queue cleared');
    } catch (error) {
      console.error('Failed to clear sync queue:', error);
      throw error;
    }
  }

  // 存储管理
  async getStorageUsage(): Promise<{ used: number; quota: number; percentage: number }> {
    try {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        const used = estimate.usage || 0;
        const quota = estimate.quota || this.maxStorageSize;
        const percentage = (used / quota) * 100;

        return { used, quota, percentage };
      } else {
        // 回退到手动计算
        const manualUsage = await this.calculateManualStorageUsage();
        return {
          used: manualUsage,
          quota: this.maxStorageSize,
          percentage: (manualUsage / this.maxStorageSize) * 100
        };
      }
    } catch (error) {
      console.error('Failed to get storage usage:', error);
      return { used: 0, quota: this.maxStorageSize, percentage: 0 };
    }
  }

  async checkStorageQuota(): Promise<void> {
    const usage = await this.getStorageUsage();
    
    if (usage.percentage > 90) {
      console.warn('Storage quota nearly exceeded, cleaning up...');
      await this.cleanupOldData();
    }
  }

  async cleanupOldData(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      // 删除最旧的小说（保留最近的50本）
      const novels = await this.getAllNovels();
      if (novels.length > this.maxNovels) {
        const novelsToDelete = novels.slice(this.maxNovels);
        for (const novel of novelsToDelete) {
          await this.deleteNovel(novel.id);
        }
      }

      // 清理旧的同步队列项目（保留最近7天的）
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const transaction = this.db.transaction(['syncQueue'], 'readwrite');
      const store = transaction.objectStore('syncQueue');
      const index = store.index('timestamp');
      
      const oldItems = await this.promisifyRequest(
        index.getAll(IDBKeyRange.upperBound(sevenDaysAgo))
      );
      
      for (const item of oldItems) {
        await this.promisifyRequest(store.delete(item.id));
      }

      console.log('Old data cleanup completed');
    } catch (error) {
      console.error('Failed to cleanup old data:', error);
    }
  }

  // 辅助方法
  private promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private calculateNovelSize(novel: NovelData): number {
    let size = JSON.stringify(novel).length;
    novel.chapters.forEach(chapter => {
      size += chapter.content.length;
    });
    return size;
  }

  private async calculateManualStorageUsage(): Promise<number> {
    if (!this.db) return 0;

    let totalSize = 0;
    const storeNames = ['novels', 'chapters', 'readingProgress', 'bookmarks', 'userPreferences', 'syncQueue'];

    for (const storeName of storeNames) {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore('store');
      const items = await this.promisifyRequest(store.getAll());
      
      items.forEach(item => {
        totalSize += JSON.stringify(item).length;
      });
    }

    return totalSize;
  }

  private async updateCacheMetadata(type: string, key: string, size: number): Promise<void> {
    if (!this.db) return;

    const transaction = this.db.transaction(['cacheMetadata'], 'readwrite');
    const store = transaction.objectStore('cacheMetadata');

    const metadata = {
      key: `${type}:${key}`,
      type,
      size,
      lastAccessed: Date.now()
    };

    try {
      await this.promisifyRequest(store.put(metadata));
    } catch (error) {
      console.error('Failed to update cache metadata:', error);
    }
  }

  private async removeCacheMetadata(type: string, key: string): Promise<void> {
    if (!this.db) return;

    const transaction = this.db.transaction(['cacheMetadata'], 'readwrite');
    const store = transaction.objectStore('cacheMetadata');

    try {
      await this.promisifyRequest(store.delete(`${type}:${key}`));
    } catch (error) {
      console.error('Failed to remove cache metadata:', error);
    }
  }
}

// 单例实例
export const offlineStorageManager = new OfflineStorageManager();
export default OfflineStorageManager;