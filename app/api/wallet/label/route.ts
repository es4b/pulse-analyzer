export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSession, getOrCreateUser } from '@/lib/auth/session';
import pool from '@/lib/db';

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as { label?: string };
  const { label } = body;

  const user = await getOrCreateUser(session.user.email);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  try {
    await pool.query(
      'UPDATE wallets SET label = $1 WHERE user_id = $2',
      [label || null, user.id]
    );
  } catch {
    return NextResponse.json({ error: 'Failed to update label' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
