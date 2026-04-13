export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { fetchAllWalletData } from '@/lib/pulsechain/api';
import { computeAllAnalysis } from '@/lib/analysis/compute';
import { sendDailySummary } from '@/lib/notifications';
import type { RawWalletData } from '@/lib/supabase/types';

export async function GET() {
  const supabase = createServerSupabaseClient();

  const { data: wallets } = await supabase.from('wallets').select('*, users(*)');

  if (!wallets || wallets.length === 0) {
    return NextResponse.json({ message: 'No wallets to refresh' });
  }

  const results: { walletId: string; status: string }[] = [];

  for (const wallet of wallets) {
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

      if (wallet.users) {
        const user = wallet.users as { id: string };
        await sendDailySummary(user.id);
      }

      results.push({ walletId: wallet.id, status: 'ok' });
    } catch (err) {
      results.push({ walletId: wallet.id, status: 'error' });
    }
  }

  return NextResponse.json({ results });
}
