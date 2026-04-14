import OpenAI from 'openai';
import type { AnalysisMetrics, RawWalletData, AiInsightsData } from '@/lib/types';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type AiInsights = AiInsightsData;

function buildPrompt(
  raw: RawWalletData,
  metrics: AnalysisMetrics,
  walletAddress: string,
  locale: string
): string {
  const responseLang = locale === 'lt' ? 'Lithuanian' : 'English';
  const langInstruction = `\n\nCRITICAL LANGUAGE REQUIREMENT: Write ALL text values in ${responseLang}, except "summary.lt" (always Lithuanian) and "summary.en" (always English).\n`;

  // Trim to essentials for the prompt
  const metricsForPrompt = {
    walletAddress: metrics.walletAddress,
    transactionCount: metrics.transactionCount,
    walletAgeDays: metrics.walletAgeDays,
    profileLabel: metrics.profileLabel,
    metaScores: metrics.metaScores,
    performance: {
      realizedPnlUsd: round(metrics.performance.realizedPnlUsd),
      unrealizedPnlUsd: round(metrics.performance.unrealizedPnlUsd),
      totalPnlUsd: round(metrics.performance.totalPnlUsd),
      roiPercent: round(metrics.performance.roiPercent),
      totalInflowUsd: round(metrics.performance.totalInflowUsd),
      totalOutflowUsd: round(metrics.performance.totalOutflowUsd),
      winRate: metrics.performance.winRate,
      lossRate: metrics.performance.lossRate,
      expectancy: round(metrics.performance.expectancy),
      maxDrawdownUsd: round(metrics.performance.maxDrawdownUsd),
      longestWinStreak: metrics.performance.longestWinStreak,
      longestLossStreak: metrics.performance.longestLossStreak,
      tradeCount: metrics.performance.tradeCount,
    },
    psychology: metrics.psychology,
    strategy: metrics.strategy,
    bot: metrics.bot,
    behavior: {
      tradesPerDay: round(metrics.behavior.tradesPerDay),
      tradesPerWeek: round(metrics.behavior.tradesPerWeek),
      burstCount: metrics.behavior.burstCount,
      avgBurstSize: round(metrics.behavior.avgBurstSize),
    },
    network: {
      uniqueCounterpartiesCount: metrics.network.uniqueCounterpartiesCount,
      contractInteractionPct: metrics.network.contractInteractionPct,
      circularFlowScore: metrics.network.circularFlowScore,
      topCounterparties: metrics.network.topCounterparties.slice(0, 5),
    },
    token: metrics.token,
    risk: metrics.risk,
    portfolio: {
      plsBalance: round(metrics.portfolio.plsBalance),
      portfolioValue: round(metrics.portfolio.portfolioValue),
      tokenCount: metrics.portfolio.tokens.length,
      gasFeesUsd: round(metrics.portfolio.gasFeesUsd),
    },
  };

  return `Analyze this PulseChain wallet based on computed forensic metrics.

Wallet: ${walletAddress}
Total PLS transactions: ${raw.transactions.length}
Current tokens held: ${raw.tokens.length}

COMPUTED METRICS:
${JSON.stringify(metricsForPrompt, null, 2)}
${langInstruction}
Based on these metrics, identify strengths, weaknesses, risks, and contradictions in this wallet's behavior. Return ONLY a JSON object with this exact structure:

{
  "strengths": ["2-4 concrete strengths with numbers from the metrics"],
  "weaknesses": ["2-4 concrete weaknesses with numbers"],
  "risks": ["2-4 specific risks with severity context"],
  "strategy_type": "One-paragraph description of the overall strategy signature (e.g. 'High-frequency scalper with poor drawdown control')",
  "confidence": 0.0-1.0,
  "contradictions": ["0-3 interesting contradictions, e.g. 'High trade volume (500+ trades) but negative expectancy ($-12)'"],
  "summary": {
    "lt": "2-3 sakinių apibendrinimas lietuvių kalba",
    "en": "2-3 sentence summary in English"
  }
}

Ground every claim in the numbers. Be specific. Avoid generic statements.`;
}

function round(n: number, digits = 2): number {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}

function parseResponse(text: string): AiInsightsData {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in AI response');
  const parsed = JSON.parse(jsonMatch[0]);
  return {
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
    weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
    risks: Array.isArray(parsed.risks) ? parsed.risks : [],
    strategyType: parsed.strategy_type ?? parsed.strategyType ?? '',
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    contradictions: Array.isArray(parsed.contradictions) ? parsed.contradictions : [],
    summary: {
      lt: parsed.summary?.lt ?? '',
      en: parsed.summary?.en ?? '',
    },
  };
}

export async function generateAiInsights(
  raw: RawWalletData,
  metrics: AnalysisMetrics,
  // Second arg kept for call-site compat with older callers (unused now):
  _behavioralPatterns: unknown,
  walletAddress: string,
  locale: string = 'en'
): Promise<AiInsightsData | null> {
  if (!process.env.OPENAI_API_KEY) {
    console.log('[AI Insights] No OPENAI_API_KEY set, skipping');
    return null;
  }

  try {
    console.log('[AI Insights] Sending wallet metrics to GPT-4o-mini (locale=%s)...', locale);
    const prompt = buildPrompt(raw, metrics, walletAddress, locale);

    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 2048,
      messages: [
        {
          role: 'system',
          content: `You are an expert blockchain forensics analyst. Analyze PulseChain wallet metrics and identify strengths, weaknesses, risks, contradictions, and overall strategy signature. Respond in JSON. Write all text values in ${locale === 'lt' ? 'Lithuanian' : 'English'}, except summary.lt (always Lithuanian) and summary.en (always English).`,
        },
        { role: 'user', content: prompt },
      ],
    });

    const text = completion.choices[0]?.message?.content;
    if (!text) throw new Error('Empty response from OpenAI');

    const insights = parseResponse(text);
    console.log('[AI Insights] Analysis complete');
    return insights;
  } catch (err) {
    console.error('[AI Insights] Error:', err);
    return null;
  }
}
