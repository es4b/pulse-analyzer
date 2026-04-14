export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSession, getOrCreateUser } from '@/lib/auth/session';
import pool from '@/lib/db';

export async function GET() {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await getOrCreateUser(session.user.email);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const { rows: wallets } = await pool.query(
    'SELECT id FROM wallets WHERE user_id = $1 LIMIT 1',
    [user.id]
  );

  if (wallets.length === 0) return NextResponse.json({ analysis: null });

  const { rows: analysis } = await pool.query(
    'SELECT * FROM analysis_results WHERE wallet_id = $1 ORDER BY created_at DESC LIMIT 1',
    [wallets[0].id]
  );

  return NextResponse.json({ analysis: analysis[0] || null });
}
