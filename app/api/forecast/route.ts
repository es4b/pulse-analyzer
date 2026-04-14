export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSession, getOrCreateUser } from '@/lib/auth/session';
import pool from '@/lib/db';
import type { ForecastResponse } from '@/lib/forecast/types';

/**
 * GET /api/forecast
 *
 * Reads the most recently computed forecast for the user's wallet from
 * `forecast_results`. Does NOT recompute. Does NOT call any external APIs.
 *
 * The forecast is generated inside POST /api/wallet/refresh; press Refresh
 * on the dashboard to produce a new one.
 */
export async function GET(_req: NextRequest) {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await getOrCreateUser(session.user.email);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const { rows: wallets } = await pool.query(
    'SELECT * FROM wallets WHERE user_id = $1 LIMIT 1',
    [user.id]
  );
  if (wallets.length === 0) {
    return NextResponse.json({ error: 'No wallet found' }, { status: 404 });
  }
  const wallet = wallets[0];

  const { rows } = await pool.query(
    `SELECT prediction, created_at FROM forecast_results
     WHERE wallet_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [wallet.id]
  );

  if (rows.length === 0) {
    return NextResponse.json(
      { forecast: null, hasForecast: false, message: 'No forecast available. Press Refresh to generate one.' },
      { status: 200 }
    );
  }

  const forecast = rows[0].prediction as ForecastResponse;
  return NextResponse.json({ forecast, hasForecast: true, computedAt: rows[0].created_at });
}
