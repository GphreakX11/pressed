import { kv } from '@vercel/kv';

async function scrubTestUser() {
  const keys = [
    'apex_global_alltime',
    'apex_leaderboard_accuracy',
    'leaderboard_survivalist',
    'leaderboard_clears',
  ];

  for (const key of keys) {
    const members = await kv.zrange(key, 0, -1);
    const toRemove = members.filter(m => {
      const s = typeof m === 'string' ? m : (m as any).member;
      if (!s) return false;
      return s.toLowerCase().startsWith('testuser:');
    });

    if (toRemove.length > 0) {
      console.log(`Removing ${toRemove.length} test entries from ${key}`);
      await kv.zrem(key, ...toRemove);
    }
  }
}

scrubTestUser().then(() => console.log('Done')).catch(console.error);
