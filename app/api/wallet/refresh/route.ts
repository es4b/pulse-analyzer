export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSession, getOrCreateUser } from '@/lib/auth/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { fetchAllWalletData } from '@/lib/pulsechain/api';
import { computeAllAnalysis } from '@/lib/analysis/compute';
import type { RawWalletData } from '@/lib/supabase/types';

export async function POST() {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();

  const user = await getOrCreateUser(session.user.email);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const { data: wallet } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!wallet) return NextResponse.json({ error: 'No wallet found' }, { status: 404 });

  try {
    const rawData = await fetchAllWalletData(wallet.address);
    const raw: RawWalletData = {
      balance: rawData.balance.balance,
      tokens: rawData.tokens,
      transactions: rawData.transactions,
      internalTransactions: rawData.internalTransactions,
    };

    await supabase.from('wallet_data').insert({
      wallet_id: wallet.id,
      raw_data: raw,
    });

    const analysis = computeAllAnalysis(raw, wallet.address);

    await supabase.from('analysis_results').insert({
      wallet_id: wallet.id,
      ...analysis,
    });

    await supabase
      .from('wallets')
      .update({ last_updated: new Date().toISOString() })
      .eq('id', wallet.id);

    return NextResponse.json({ success: true, lastUpdated: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to refresh' }, { status: 500 });
  }
}
