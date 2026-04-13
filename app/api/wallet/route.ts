export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSession, getOrCreateUser } from '@/lib/auth/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { fetchAllWalletData } from '@/lib/pulsechain/api';
import { computeAllAnalysis } from '@/lib/analysis/compute';
import type { RawWalletData } from '@/lib/supabase/types';

function isValidPulseChainAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export async function GET() {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const user = await getOrCreateUser(session.user.email);
  if (!user) return NextResponse.json({ wallet: null });

  const { data: wallet } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', user.id)
    .single();

  return NextResponse.json({ wallet: wallet || null });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as { address?: string; label?: string };
  const { address, label } = body;

  if (!address || !isValidPulseChainAddress(address)) {
    return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const user = await getOrCreateUser(session.user.email);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const { data: existing } = await supabase
    .from('wallets')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (existing) {
    return NextResponse.json({ error: 'Wallet already exists' }, { status: 400 });
  }

  const { data: wallet, error } = await supabase
    .from('wallets')
    .insert({ user_id: user.id, address, label: label || null })
    .select()
    .single();

  if (error || !wallet) {
    return NextResponse.json({ error: 'Failed to create wallet' }, { status: 500 });
  }

  try {
    const rawData = await fetchAllWalletData(address);
    const raw: RawWalletData = {
      balance: rawData.balance.balance,
      tokens: rawData.tokens,
      transactions: rawData.transactions,
      internalTransactions: rawData.internalTransactions,
    };

    await supabase.from('wallet_data').insert({ wallet_id: wallet.id, raw_data: raw });

    const analysis = computeAllAnalysis(raw, address);
    await supabase.from('analysis_results').insert({ wallet_id: wallet.id, ...analysis });

    await supabase
      .from('wallets')
      .update({ last_updated: new Date().toISOString() })
      .eq('id', wallet.id);
  } catch {
    // non-fatal — wallet is saved, data fetch failed
  }

  return NextResponse.json({ wallet });
}

export async function DELETE() {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const user = await getOrCreateUser(session.user.email);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  await supabase.from('wallets').delete().eq('user_id', user.id);

  return NextResponse.json({ success: true });
}
