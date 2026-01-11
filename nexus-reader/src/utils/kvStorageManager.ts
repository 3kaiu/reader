/**
 * Smart KV Storage Management System
 * 
 * Implements intelligent storage management for Cloudflare KV with:
 * - Automatic data cleanup algorithms
 * - Storage usage monitoring
 * - Intelligent data retention policies
 * - Free tier limit optimization (1GB storage limit)
 */

export interface KVStorageConfig {
  maxStorageSize: number; // Maximum storage in bytes (1GB for free tier)
  retentionPolicies: RetentionPolicy[];
  cleanupInterval: number; // Cleanup interval in milliseconds
  warningThreshold: number; // Warning threshold as percentage (0-1)
  criticalThreshold: number; // Critical threshold as percentage (0-1)
  enableAutoCleanup: boolean;
  enableCompression: boolean;
}

export interface RetentionPolicy {
  keyPattern: string; // Regex pattern for keys
  maxAge: number; // Maximum age in milliseconds
  priority: number; // Priority for cleanup (higher = keep longer)
  compressionEnabled: boolean;
}

export interface StorageUsage {
  totalSize: number;
  usedSize: number;
  availableSize: number;
  usagePercentage: number;
  keyCount: number;
  lastCleanup: number;
}

export interface StorageMetrics {
  usage: StorageUsage;
  topKeys: Array<{ key: string; size: number; lastAccessed: number }>;
  retentionStatus: Array<{ pattern: string; keysAffected: number; sizeFreed: number }>;
  cleanupHistory: Array<{ timestamp: number; keysRemoved: number; sizeFreed: number }>;
}

export interface CleanupResult {
  keysRemoved: number;
  sizeFreed: number;
  errors: string[];
  duration: number;
}

const DEFAULT_CONFIG: KVStorageConfig = {
  maxStorageSize: 1024 * 1024 * 1024, // 1GB free tier limit
  retentionPolicies: [
    {
      keyPattern: '^temp:.*',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      priority: 1,
      compressionEnabled: true
    },
    {
      keyPattern: '^cache:.*',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      priority: 2,
      compressionEnabled: true
    },
    {
      keyPattern: '^user:.*:progress',
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
      priority: 10,
      compressionEnabled: false
    },
    {
      keyPattern: '^user:.*:preferences',
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
      priority: 10,
      compressionEnabled: false
    }
  ],
  cleanupInterval: 60 * 60 * 1000, // 1 hour
  warningThreshold: 0.8, // 80%
  criticalThreshold: 0.95, // 95%
  enableAutoCleanup: true,
  enableCompression: true
};

export class KVStorageManager {
  private config: KVStorageConfig;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private storageUsage: StorageUsage;
  private cleanupHistory: Array<{ timestamp: number; keysRemoved: number; sizeFreed: number }> = [];

  constructor(config: Partial<KVStorageConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.storageUsage = {
      totalSize: this.config.maxStorageSize,
      usedSize: 0,
      availableSize: this.config.maxStorageSize,
      usagePercentage: 0,
      keyCount: 0,
      lastCleanup: Date.now()
    };

    if (this.config.enableAutoCleanup) {
      this.startAutoCleanup();
    }
  }

  /**
   * Get current storage usage statistics
   */
  async getStorageUsage(): Promise<StorageUsage> {
    try {
      // In a real implementation, this would query Cloudflare KV API
      // For now, we simulate the storage usage calculation
      const keys = await this.getAllKeys();
      let totalUsedSize = 0;
      
      for (const key of keys) {
        const value = await this.getValue(key);
        if (value) {
          totalUsedSize += this.calculateSize(key, value);
        }
      }

      this.storageUsage = {
        totalSize: this.config.maxStorageSize,
        usedSize: totalUsedSize,
        availableSize: this.config.maxStorageSize - totalUsedSize,
        usagePercentage: totalUsedSize / this.config.maxStorageSize,
        keyCount: keys.length,
        lastCleanup: this.storageUsage.lastCleanup
      };

      return this.storageUsage;
    } catch (error) {
      console.error('Failed to get storage usage:', error);
      return this.storageUsage;
    }
  }

  /**
   * Perform intelligent cleanup based on retention policies
   */
  async performCleanup(): Promise<CleanupResult> {
    const startTime = Date.now();
    const result: CleanupResult = {
      keysRemoved: 0,
      sizeFreed: 0,
      errors: [],
      duration: 0
    };

    try {
      const keys = await this.getAllKeys();
      const keysToRemove: Array<{ key: string; size: number; reason: string }> = [];

      // Apply retention policies
      for (const policy of this.config.retentionPolicies.sort((a, b) => a.priority - b.priority)) {
        const regex = new RegExp(policy.keyPattern);
        const matchingKeys = keys.filter(key => regex.test(key));

        for (const key of matchingKeys) {
          const metadata = await this.getKeyMetadata(key);
          if (metadata && this.isExpired(metadata.lastModified, policy.maxAge)) {
            const size = await this.getKeySize(key);
            keysToRemove.push({
              key,
              size,
              reason: `Expired according to policy: ${policy.keyPattern}`
            });
          }
        }
      }

      // If still over threshold, remove least recently accessed keys
      const currentUsage = await this.getStorageUsage();
      if (currentUsage.usagePercentage > this.config.criticalThreshold) {
        const additionalKeys = await this.getLeastRecentlyAccessedKeys(
          Math.ceil(keys.length * 0.1) // Remove 10% of keys
        );
        
        for (const key of additionalKeys) {
          if (!keysToRemove.find(k => k.key === key)) {
            const size = await this.getKeySize(key);
            keysToRemove.push({
              key,
              size,
              reason: 'Storage critical threshold exceeded'
            });
          }
        }
      }

      // Remove keys
      for (const { key, size, reason } of keysToRemove) {
        try {
          await this.removeKey(key);
          result.keysRemoved++;
          result.sizeFreed += size;
          console.log(`Removed key: ${key} (${size} bytes) - ${reason}`);
        } catch (error) {
          result.errors.push(`Failed to remove key ${key}: ${error}`);
        }
      }

      // Update cleanup history
      this.cleanupHistory.push({
        timestamp: Date.now(),
        keysRemoved: result.keysRemoved,
        sizeFreed: result.sizeFreed
      });

      // Keep only last 100 cleanup records
      if (this.cleanupHistory.length > 100) {
        this.cleanupHistory = this.cleanupHistory.slice(-100);
      }

      this.storageUsage.lastCleanup = Date.now();
      result.duration = Date.now() - startTime;

      console.log(`Cleanup completed: ${result.keysRemoved} keys removed, ${result.sizeFreed} bytes freed`);
      return result;

    } catch (error) {
      result.errors.push(`Cleanup failed: ${error}`);
      result.duration = Date.now() - startTime;
      return result;
    }
  }

  /**
   * Get comprehensive storage metrics
   */
  async getStorageMetrics(): Promise<StorageMetrics> {
    const usage = await this.getStorageUsage();
    const keys = await this.getAllKeys();
    
    // Get top keys by size
    const keysSizes = await Promise.all(
      keys.map(async key => ({
        key,
        size: await this.getKeySize(key),
        lastAccessed: (await this.getKeyMetadata(key))?.lastAccessed || 0
      }))
    );
    
    const topKeys = keysSizes
      .sort((a, b) => b.size - a.size)
      .slice(0, 10);

    // Calculate retention status
    const retentionStatus = await Promise.all(
      this.config.retentionPolicies.map(async policy => {
        const regex = new RegExp(policy.keyPattern);
        const matchingKeys = keys.filter(key => regex.test(key));
        let keysAffected = 0;
        let sizeFreed = 0;

        for (const key of matchingKeys) {
          const metadata = await this.getKeyMetadata(key);
          if (metadata && this.isExpired(metadata.lastModified, policy.maxAge)) {
            keysAffected++;
            sizeFreed += await this.getKeySize(key);
          }
        }

        return {
          pattern: policy.keyPattern,
          keysAffected,
          sizeFreed
        };
      })
    );

    return {
      usage,
      topKeys,
      retentionStatus,
      cleanupHistory: [...this.cleanupHistory]
    };
  }

  /**
   * Check if storage needs attention
   */
  async checkStorageHealth(): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    message: string;
    recommendations: string[];
  }> {
    const usage = await this.getStorageUsage();
    const recommendations: string[] = [];

    if (usage.usagePercentage >= this.config.criticalThreshold) {
      recommendations.push('Immediate cleanup required');
      recommendations.push('Consider increasing retention policy strictness');
      recommendations.push('Review large keys for optimization opportunities');
      
      return {
        status: 'critical',
        message: `Storage usage critical: ${(usage.usagePercentage * 100).toFixed(1)}%`,
        recommendations
      };
    }

    if (usage.usagePercentage >= this.config.warningThreshold) {
      recommendations.push('Schedule cleanup soon');
      recommendations.push('Monitor storage growth trends');
      recommendations.push('Consider enabling compression for more key patterns');
      
      return {
        status: 'warning',
        message: `Storage usage high: ${(usage.usagePercentage * 100).toFixed(1)}%`,
        recommendations
      };
    }

    return {
      status: 'healthy',
      message: `Storage usage normal: ${(usage.usagePercentage * 100).toFixed(1)}%`,
      recommendations: ['Continue monitoring', 'Regular cleanup is working well']
    };
  }

  /**
   * Optimize storage by compressing eligible keys
   */
  async optimizeStorage(): Promise<{
    keysCompressed: number;
    spaceSaved: number;
    errors: string[];
  }> {
    const result = {
      keysCompressed: 0,
      spaceSaved: 0,
      errors: []
    };

    if (!this.config.enableCompression) {
      return result;
    }

    try {
      const keys = await this.getAllKeys();
      
      for (const key of keys) {
        const policy = this.findMatchingPolicy(key);
        if (policy?.compressionEnabled) {
          try {
            const originalSize = await this.getKeySize(key);
            const compressed = await this.compressKey(key);
            
            if (compressed) {
              const newSize = await this.getKeySize(key);
              result.keysCompressed++;
              result.spaceSaved += originalSize - newSize;
            }
          } catch (error) {
            result.errors.push(`Failed to compress key ${key}: ${String(error)}`);
          }
        }
      }

      console.log(`Storage optimization completed: ${result.keysCompressed} keys compressed, ${result.spaceSaved} bytes saved`);
      return result;

    } catch (error) {
      result.errors.push(`Storage optimization failed: ${String(error)}`);
      return result;
    }
  }

  /**
   * Start automatic cleanup timer
   */
  private startAutoCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(async () => {
      const usage = await this.getStorageUsage();
      
      if (usage.usagePercentage > this.config.warningThreshold) {
        console.log('Auto cleanup triggered due to high storage usage');
        await this.performCleanup();
      }
    }, this.config.cleanupInterval);
  }

  /**
   * Stop automatic cleanup
   */
  stopAutoCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopAutoCleanup();
  }

  // Private helper methods

  private async getAllKeys(): Promise<string[]> {
    // In a real implementation, this would use Cloudflare KV API
    // For now, simulate with localStorage or mock data
    if (typeof window !== 'undefined' && window.localStorage) {
      const allKeys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('kv:')) {
          allKeys.push(key.substring(3)); // Remove 'kv:' prefix
        }
      }
      return allKeys;
    }
    return [];
  }

  private async getValue(key: string): Promise<any> {
    if (typeof window !== 'undefined' && window.localStorage) {
      const value = localStorage.getItem(`kv:${key}`);
      return value ? JSON.parse(value) : null;
    }
    return null;
  }

  private async removeKey(key: string): Promise<void> {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem(`kv:${key}`);
    }
  }

  private async getKeySize(key: string): Promise<number> {
    const value = await this.getValue(key);
    if (!value) return 0;
    
    return this.calculateSize(key, value);
  }

  private calculateSize(key: string, value: any): number {
    const keySize = new Blob([key]).size;
    const valueSize = new Blob([JSON.stringify(value)]).size;
    return keySize + valueSize;
  }

  private async getKeyMetadata(key: string): Promise<{ lastModified: number; lastAccessed: number } | null> {
    // In a real implementation, this would get metadata from KV
    // For now, simulate with reasonable defaults
    const now = Date.now();
    return {
      lastModified: now - Math.random() * 30 * 24 * 60 * 60 * 1000, // Random within 30 days
      lastAccessed: now - Math.random() * 7 * 24 * 60 * 60 * 1000   // Random within 7 days
    };
  }

  private isExpired(timestamp: number, maxAge: number): boolean {
    return Date.now() - timestamp > maxAge;
  }

  private async getLeastRecentlyAccessedKeys(count: number): Promise<string[]> {
    const keys = await this.getAllKeys();
    const keysWithAccess = await Promise.all(
      keys.map(async key => ({
        key,
        lastAccessed: (await this.getKeyMetadata(key))?.lastAccessed || 0
      }))
    );

    return keysWithAccess
      .sort((a, b) => a.lastAccessed - b.lastAccessed)
      .slice(0, count)
      .map(item => item.key);
  }

  private findMatchingPolicy(key: string): RetentionPolicy | null {
    return this.config.retentionPolicies.find(policy => 
      new RegExp(policy.keyPattern).test(key)
    ) || null;
  }

  private async compressKey(key: string): Promise<boolean> {
    // In a real implementation, this would compress the value and store it back
    // For now, simulate compression
    const value = await this.getValue(key);
    if (!value) return false;

    // Simulate compression by reducing the stored data size
    // In reality, you'd use compression algorithms like gzip
    console.log(`Compressing key: ${key}`);
    return true;
  }
}

// Export singleton instance
export const kvStorageManager = new KVStorageManager();

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    kvStorageManager.destroy();
  });
}