/**
 * Simple In-Memory Cache Service
 * TTL-based caching with automatic cleanup
 */

class CacheService {
  constructor() {
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0
    };

    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000);
  }

  /**
   * Generate cache key for Shopify data
   * @param {string} type - Data type (orders, customers, products, discounts)
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @param {object} options - Additional options to include in key
   */
  generateKey(type, startDate, endDate, options = {}) {
    const optionsStr = Object.keys(options).length > 0
      ? '_' + Object.entries(options).map(([k, v]) => `${k}=${v}`).join('_')
      : '';
    return `shopify_${type}_${startDate || 'all'}_${endDate || 'all'}${optionsStr}`;
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {any|null} - Cached value or null if expired/missing
   */
  get(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return entry.value;
  }

  /**
   * Set value in cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttlSeconds - Time to live in seconds (default: 5 minutes)
   */
  set(key, value, ttlSeconds = 300) {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttlSeconds * 1000),
      createdAt: Date.now()
    });
    this.stats.sets++;
    console.log(`[Cache] SET ${key} (TTL: ${ttlSeconds}s)`);
  }

  /**
   * Check if key exists and is valid
   * @param {string} key - Cache key
   * @returns {boolean}
   */
  has(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Delete a key from cache
   * @param {string} key - Cache key
   */
  delete(key) {
    this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this.cache.clear();
    console.log('[Cache] Cleared all entries');
  }

  /**
   * Clear entries matching a pattern
   * @param {string} pattern - Pattern to match (e.g., 'shopify_orders_')
   */
  clearPattern(pattern) {
    let cleared = 0;
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
        cleared++;
      }
    }
    console.log(`[Cache] Cleared ${cleared} entries matching "${pattern}"`);
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[Cache] Cleanup: removed ${cleaned} expired entries`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const entries = this.cache.size;
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? ((this.stats.hits / (this.stats.hits + this.stats.misses)) * 100).toFixed(1)
      : 0;

    return {
      entries,
      hits: this.stats.hits,
      misses: this.stats.misses,
      sets: this.stats.sets,
      hitRate: `${hitRate}%`
    };
  }

  /**
   * Get all cache keys (for debugging)
   */
  getKeys() {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache entry info (for debugging)
   * @param {string} key - Cache key
   */
  getInfo(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    return {
      key,
      createdAt: new Date(entry.createdAt).toISOString(),
      expiresAt: new Date(entry.expiresAt).toISOString(),
      ttlRemaining: Math.max(0, Math.round((entry.expiresAt - Date.now()) / 1000)) + 's',
      isExpired: Date.now() > entry.expiresAt
    };
  }

  /**
   * Stop the cleanup interval (for graceful shutdown)
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// TTL constants (in seconds)
const TTL = {
  ORDERS: 5 * 60,        // 5 minutes
  CUSTOMERS: 5 * 60,     // 5 minutes
  PRODUCTS: 10 * 60,     // 10 minutes
  DISCOUNTS: 30 * 60,    // 30 minutes
  STATS: 5 * 60,         // 5 minutes
  AGGREGATED: 10 * 60    // 10 minutes for pre-calculated stats
};

// Export singleton instance
const cache = new CacheService();

module.exports = {
  cache,
  TTL,
  CacheService
};
