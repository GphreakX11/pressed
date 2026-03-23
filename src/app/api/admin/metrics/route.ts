import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';
import { getDailyId } from '@/lib/puzzles';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const todayId = getDailyId();
    const dailyKey = `apex_global_daily_${todayId}`;
    const allKey = 'apex_global_alltime';

    // Helper to get true unique count (excluding ANONYMOUS and PLAYER)
    const getTrueCount = async (key: string, suffix: string = '') => {
      try {
        const total = await kv.zcard(key);
        if (total === 0) return 0;

        // Use ZLEXCOUNT for efficient prefix matching
        // Note: For dailyKey, members are "NAME:ID:DIFF". For allKey, members are "NAME:ID".
        // Both start with "NAME:".
        const [anonCount, playerCount] = await Promise.all([
          kv.zlexcount(key, '[ANONYMOUS:', '[ANONYMOUS:\xff'),
          kv.zlexcount(key, '[PLAYER:', '[PLAYER:\xff')
        ]);

        return Math.max(0, total - anonCount - playerCount);
      } catch (err) {
        console.error(`[Metrics API] Error counting ${key}:`, err);
        return 0;
      }
    };

    const [totalUnique, dailyActive] = await Promise.all([
      getTrueCount(allKey),
      getTrueCount(dailyKey)
    ]);

    return NextResponse.json({
      success: true,
      totalUnique,
      dailyActive,
      timestamp: Date.now()
    });
  } catch (err) {
    console.error('[Metrics API] Top-level error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
