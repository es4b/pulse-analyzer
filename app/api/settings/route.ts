export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSession, getOrCreateUser } from '@/lib/auth/session';
import pool from '@/lib/db';

export async function GET() {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await getOrCreateUser(session.user.email);
  if (!user) return NextResponse.json({ settings: null });

  const { rows } = await pool.query(
    'SELECT * FROM users WHERE id = $1',
    [user.id]
  );

  return NextResponse.json({ settings: rows[0] || null });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as {
    notify_email?: boolean;
    notify_telegram?: boolean;
    notify_viber?: boolean;
    telegram_chat_id?: string;
    viber_user_id?: string;
    large_tx_threshold?: number;
  };

  const user = await getOrCreateUser(session.user.email);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  try {
    await pool.query(
      `UPDATE users SET
        notify_email = $1,
        notify_telegram = $2,
        notify_viber = $3,
        telegram_chat_id = $4,
        viber_user_id = $5,
        large_tx_threshold = $6
       WHERE id = $7`,
      [
        body.notify_email,
        body.notify_telegram,
        body.notify_viber,
        body.telegram_chat_id || null,
        body.viber_user_id || null,
        body.large_tx_threshold,
        user.id,
      ]
    );
  } catch {
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
