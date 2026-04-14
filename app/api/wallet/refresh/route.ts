export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSession, getOrCreateUser } from '@/lib/auth/session';
import pool from '@/lib/db';
import { fetchAllWalletData } from '@/lib/pulsechain/api';
import { computeAllAnalysis } from '@/lib/analysis/compute';
import { generateAiInsights } from '@/lib/ai/insights';
import { getTokenPricesBulk, getPlsHistoricalPrices, WPLS_ADDRESS } from '@/lib/prices/gecko';
import { invalidateForecastCache } from '@/lib/forecast/cache';
import { runForecast } from '@/lib/forecast/engine';
import { generateForecastSummary } from '@/lib/forecast/ai';
import type { ForecastResponse } from '@/lib/forecast/types';
import type { RawWalletData } from '@/lib/types';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await getOrCreateUser(session.user.email);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const { rows: wallets } = await pool.query(
    'SELECT * FROM wallets WHERE user_id = $1 LIMIT 1',
    [user.id]
  );

  if (wallets.length === 0) return NextResponse.json({ error: 'No wallet found' }, { status: 404 });

  const wallet = wallets[0];

  // Check if data is fresh (updated less than 1 hour ago)
  if (wallet.last_updated) {
    const lastUpdated = new Date(wallet.last_updated).getTime();
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    if (lastUpdated > oneHourAgo) {
      console.log('[Refresh] Data is fresh (last updated %s), skipping', wallet.last_updated);
      return NextResponse.json({
        success: true,
        lastUpdated: wallet.last_updated,
        message: 'Data is fresh, no update needed',
      });
    }
  }

  try {
    console.log('[Refresh] Fetching PulseChain data for', wallet.address);
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

    console.log('[Refresh] Fetching token prices...');
    const tokenAddresses = [
      WPLS_ADDRESS,
      ...raw.tokens.map((t) => t.contractAddress.toLowerCase()),
    ];
    const prices = await getTokenPricesBulk(tokenAddresses);
    console.log('[Refresh] Got prices for %d/%d tokens', prices.size, tokenAddresses.length);

    console.log('[Refresh] Fetching PLS historical OHLCV...');
    const plsOhlcv = await getPlsHistoricalPrices(1000);
    console.log('[Refresh] Got %d OHLCV candles', plsOhlcv.length);

    console.log('[Refresh] Computing analysis...');
    const analysis = computeAllAnalysis(raw, wallet.address, prices, plsOhlcv);

    const locale = new URL(req.url).searchParams.get('locale') || 'en';
    console.log('[Refresh] Generating AI insights (locale: %s)...', locale);
    const aiInsights = await generateAiInsights(
      raw,
      analysis.metrics,
      analysis.behavioral_patterns,
      wallet.address,
      locale
    );
    // Note: third positional arg is retained for legacy compat but unused by the new implementation.

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

    // ─── Forecast engine run + AI summary + persist ──────────────────────
    console.log('[Refresh] Running forecast engine...');
    const state = runForecast(raw.transactions, wallet.address, plsOhlcv);
    const skillScore = analysis.metrics.metaScores.skillScore;
    const behaviorScore = analysis.metrics.metaScores.behaviorScore;
    const forecastTimeframe = '24h' as const;
    const aiSummary = await generateForecastSummary(
      state,
      forecastTimeframe,
      skillScore,
      behaviorScore,
      locale
    );

    const forecastResponse: ForecastResponse = {
      walletId: wallet.id,
      timeframe: forecastTimeframe,
      activeScenarios: state.activeScenarios,
      dominantScenario: state.dominantScenario,
      isHighConviction: state.isHighConviction,
      isRevengeAlert: state.isRevengeAlert,
      regimeShift: state.regimeShift,
      lowClarity: state.lowClarity,
      warnings: state.warnings,
      aiSummary,
      computedAt: new Date().toISOString(),
      baselines: state.baselines as unknown as Record<string, number>,
    };

    // Replace any existing forecast row for this wallet with the newest computation
    await pool.query('DELETE FROM forecast_results WHERE wallet_id = $1', [wallet.id]);
    await pool.query(
      `INSERT INTO forecast_results (wallet_id, timeframe, probability, prediction, confidence)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        wallet.id,
        forecastTimeframe,
        state.dominantScenario?.outcomes?.[0]?.probability ?? 0,
        JSON.stringify(forecastResponse),
        state.dominantScenario?.confidence ?? 0,
      ]
    );
    console.log('[Refresh] Forecast persisted');

    const lastUpdated = new Date().toISOString();
    await pool.query(
      'UPDATE wallets SET last_updated = $1 WHERE id = $2',
      [lastUpdated, wallet.id]
    );

    invalidateForecastCache(wallet.id);
    console.log('[Refresh] Complete — forecast cache invalidated');
    return NextResponse.json({
      success: true,
      lastUpdated,
      hasAiInsights: !!aiInsights,
      hasForecast: true,
    });
  } catch (err) {
    console.error('[Refresh] Error:', err);
    return NextResponse.json({ error: 'Failed to refresh' }, { status: 500 });
  }
}
