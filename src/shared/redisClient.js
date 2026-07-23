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
  static async getCache(key) {
    if (redis.status !== 'ready') return null;
    try {
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (err) {
      console.error(`[CRM Redis] getCache error for key ${key}:`, err);
      return null;
    }
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
    try {
      const stream = redis.scanStream({ match: pattern, count: 100 });
      stream.on('data', async (keys) => {
        if (keys.length) {
          const pipeline = redis.pipeline();
          keys.forEach((key) => pipeline.del(key));
          await pipeline.exec();
        }
      });
      stream.on('end', () => {});
    } catch (err) {
      console.error(`[CRM Redis] clearCachePattern error for pattern ${pattern}:`, err);
    }
  }
}

module.exports = { redis, CrmCacheService };
