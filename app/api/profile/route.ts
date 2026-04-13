export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSession, getOrCreateUser } from '@/lib/auth/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { signOut } from 'next-auth/react';

export async function DELETE() {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();

  const user = await getOrCreateUser(session.user.email);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  await supabase.from('users').delete().eq('id', user.id);

  return NextResponse.json({ success: true });
}
