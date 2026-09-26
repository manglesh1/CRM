const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: 1,
  retryStrategy(times) {
    if (times > 3) {
      console.warn('[CRM Redis] Connection failed after 3 retries. Disabling cache.');
      return null;
    }
    return Math.min(times * 100, 3000);
  },
});

redis.on('error', (err) => {
  console.error('[CRM Redis] Error:', err.message);
});

redis.on('connect', () => {
  console.log('[CRM Redis] Connected to caching layer.');
});

class CrmCacheService {
  /**
   * Get an object from cache, with an optional DB fallback.
   * If a fallbackFn is provided and the cache is empty, it will be called
   * automatically, the result will be stored in cache, and then returned.
   * @param {string} key
   * @param {Function|null} fallbackFn - async function that returns DB data
   * @param {number} ttlSeconds - TTL for the cached value (default 24h)
   * @returns {Promise<Object|null>}
   */
  static async getCache(key, fallbackFn = null, ttlSeconds = 86400) {
    if (redis.status === 'ready') {
      try {
        const data = await redis.get(key);
        if (data) return JSON.parse(data);
      } catch (err) {
        console.error(`[CRM Redis] getCache error for key ${key}:`, err);
      }
    }
    // Cache miss or Redis unavailable — use fallback if provided
    if (fallbackFn) {
      const freshData = await fallbackFn();
      if (freshData !== null && freshData !== undefined) {
        await CrmCacheService.setCache(key, freshData, ttlSeconds);
      }
      return freshData;
    }
    return null;
  }

  static async setCache(key, value, ttlSeconds = 86400) {
    if (redis.status !== 'ready') return;
    try {
      await redis.setex(key, ttlSeconds, JSON.stringify(value));
    } catch (err) {
      console.error(`[CRM Redis] setCache error for key ${key}:`, err);
    }
  }

  static async clearCache(key) {
    if (redis.status !== 'ready') return;
    try {
      await redis.del(key);
    } catch (err) {
      console.error(`[CRM Redis] clearCache error for key ${key}:`, err);
    }
  }

  static async clearCachePattern(pattern) {
    if (redis.status !== 'ready') return;
    return new Promise((resolve) => {
      try {
        const stream = redis.scanStream({ match: pattern, count: 100 });
        stream.on('data', async (keys) => {
          if (keys.length) {
            stream.pause();
            const pipeline = redis.pipeline();
            keys.forEach((key) => pipeline.del(key));
            await pipeline.exec();
            stream.resume();
          }
        });
        stream.on('end', () => resolve());
        stream.on('error', (err) => {
          console.error(`[CRM Redis] clearCachePattern error for pattern ${pattern}:`, err);
          resolve();
        });
      } catch (err) {
        console.error(`[CRM Redis] clearCachePattern error for pattern ${pattern}:`, err);
        resolve();
      }
    });
  }
}

module.exports = { redis, CrmCacheService };
