export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { fetchAllWalletData } from '@/lib/pulsechain/api';
import { computeAllAnalysis } from '@/lib/analysis/compute';
import { sendDailySummary } from '@/lib/notifications';
import type { RawWalletData } from '@/lib/types';

export async function GET() {
  const { rows: wallets } = await pool.query(
    'SELECT w.*, u.id AS user_id FROM wallets w JOIN users u ON u.id = w.user_id'
  );

  if (wallets.length === 0) {
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

      await pool.query(
        'INSERT INTO wallet_data (wallet_id, raw_data) VALUES ($1, $2)',
        [wallet.id, JSON.stringify(raw)]
      );

      const analysis = computeAllAnalysis(raw, wallet.address);
      await pool.query(
        `INSERT INTO analysis_results (wallet_id, metrics, behavioral_patterns, network_analysis, anomalies)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          wallet.id,
          JSON.stringify(analysis.metrics),
          JSON.stringify(analysis.behavioral_patterns),
          JSON.stringify(analysis.network_analysis),
          JSON.stringify(analysis.anomalies),
        ]
      );

      await pool.query(
        'UPDATE wallets SET last_updated = $1 WHERE id = $2',
        [new Date().toISOString(), wallet.id]
      );

      await sendDailySummary(wallet.user_id);

      results.push({ walletId: wallet.id, status: 'ok' });
    } catch {
      results.push({ walletId: wallet.id, status: 'error' });
    }
  }

  return NextResponse.json({ results });
}
