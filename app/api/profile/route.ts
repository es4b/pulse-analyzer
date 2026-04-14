export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSession, getOrCreateUser } from '@/lib/auth/session';
import pool from '@/lib/db';

export async function DELETE() {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await getOrCreateUser(session.user.email);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  await pool.query('DELETE FROM users WHERE id = $1', [user.id]);

  return NextResponse.json({ success: true });
}
