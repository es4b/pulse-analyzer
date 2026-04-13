export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSession, getOrCreateUser } from '@/lib/auth/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateForecast } from '@/lib/ai/forecast';
import type { RawWalletData, Transaction } from '@/lib/supabase/types';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as { timeframe?: string };
  const { timeframe = '24h' } = body;

  const supabase = createServerSupabaseClient();

  const user = await getOrCreateUser(session.user.email);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const { data: wallet } = await supabase
    .from('wallets')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!wallet) return NextResponse.json({ error: 'No wallet found' }, { status: 404 });

  const { data: walletData } = await supabase
    .from('wallet_data')
    .select('raw_data')
    .eq('wallet_id', wallet.id)
    .order('analyzed_at', { ascending: false })
    .limit(1)
    .single();

  const raw = walletData?.raw_data as RawWalletData | null;
  const transactions: Transaction[] = raw?.transactions ?? [];

  try {
    const prediction = await generateForecast(transactions, timeframe);

    const { data: forecast } = await supabase
      .from('forecast_results')
      .insert({
        wallet_id: wallet.id,
        timeframe,
        probability: prediction.probabilities.hold,
        prediction,
        confidence: prediction.confidence,
      })
      .select()
      .single();

    return NextResponse.json({ forecast: forecast || { prediction, timeframe } });
  } catch {
    return NextResponse.json({ error: 'Forecast generation failed' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const timeframe = searchParams.get('timeframe') || '24h';

  const supabase = createServerSupabaseClient();

  const user = await getOrCreateUser(session.user.email);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const { data: wallet } = await supabase
    .from('wallets')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!wallet) return NextResponse.json({ forecast: null });

  const { data: forecast } = await supabase
    .from('forecast_results')
    .select('*')
    .eq('wallet_id', wallet.id)
    .eq('timeframe', timeframe)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return NextResponse.json({ forecast: forecast || null });
}
