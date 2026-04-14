export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSession, getOrCreateUser } from '@/lib/auth/session';
import pool from '@/lib/db';
import { fetchAllWalletData } from '@/lib/pulsechain/api';
import { computeAllAnalysis } from '@/lib/analysis/compute';
import { generateAiInsights } from '@/lib/ai/insights';
import { getTokenPricesBulk, getPlsHistoricalPrices, WPLS_ADDRESS } from '@/lib/prices/gecko';
import type { RawWalletData } from '@/lib/types';

function isValidPulseChainAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export async function GET() {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await getOrCreateUser(session.user.email);
  if (!user) return NextResponse.json({ wallet: null });

  const { rows } = await pool.query(
    'SELECT * FROM wallets WHERE user_id = $1 LIMIT 1',
    [user.id]
  );

  return NextResponse.json({ wallet: rows[0] || null });
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

  const user = await getOrCreateUser(session.user.email);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const { rows: existing } = await pool.query(
    'SELECT id FROM wallets WHERE user_id = $1 LIMIT 1',
    [user.id]
  );

  if (existing.length > 0) {
    return NextResponse.json({ error: 'Wallet already exists' }, { status: 400 });
  }

  const { rows: inserted } = await pool.query(
    'INSERT INTO wallets (user_id, address, label) VALUES ($1, $2, $3) RETURNING *',
    [user.id, address, label || null]
  );
  const wallet = inserted[0];

  if (!wallet) {
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

    await pool.query(
      'INSERT INTO wallet_data (wallet_id, raw_data) VALUES ($1, $2)',
      [wallet.id, JSON.stringify(raw)]
    );

    const tokenAddresses = [WPLS_ADDRESS, ...raw.tokens.map((t) => t.contractAddress.toLowerCase())];
    const prices = await getTokenPricesBulk(tokenAddresses);
    const plsOhlcv = await getPlsHistoricalPrices(1000);
    const analysis = computeAllAnalysis(raw, address, prices, plsOhlcv);
    const aiInsights = await generateAiInsights(
      raw, analysis.metrics, analysis.behavioral_patterns, address, 'en'
    );
    await pool.query(
      `INSERT INTO analysis_results (wallet_id, metrics, behavioral_patterns, network_analysis, anomalies, ai_insights)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        wallet.id,
        JSON.stringify(analysis.metrics),
        JSON.stringify(analysis.behavioral_patterns),
        JSON.stringify(analysis.network_analysis),
        JSON.stringify(analysis.anomalies),
        aiInsights ? JSON.stringify(aiInsights) : null,
      ]
    );

    await pool.query(
      'UPDATE wallets SET last_updated = $1 WHERE id = $2',
      [new Date().toISOString(), wallet.id]
    );
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

  const user = await getOrCreateUser(session.user.email);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  await pool.query('DELETE FROM wallets WHERE user_id = $1', [user.id]);

  return NextResponse.json({ success: true });
}
