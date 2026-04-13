export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSession, getOrCreateUser } from '@/lib/auth/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as { label?: string };
  const { label } = body;

  const supabase = createServerSupabaseClient();

  const user = await getOrCreateUser(session.user.email);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const { error } = await supabase
    .from('wallets')
    .update({ label: label || null })
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: 'Failed to update label' }, { status: 500 });

  return NextResponse.json({ success: true });
}
