export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSession, getOrCreateUser } from '@/lib/auth/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET() {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();

  const user = await getOrCreateUser(session.user.email);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const { data: wallet } = await supabase
    .from('wallets')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!wallet) return NextResponse.json({ analysis: null });

  const { data: analysis } = await supabase
    .from('analysis_results')
    .select('*')
    .eq('wallet_id', wallet.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return NextResponse.json({ analysis: analysis || null });
}
