import Anthropic from '@anthropic-ai/sdk';
import type { ForecastPrediction } from '@/lib/supabase/types';
import type { Transaction } from '@/lib/supabase/types';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export function buildForecastPrompt(transactions: Transaction[], timeframe: string): string {
  const recentTxs = transactions.slice(-50);
  const summary = recentTxs.map((tx) => ({
    timestamp: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
    from: tx.from,
    to: tx.to,
    valueEth: (parseInt(tx.value || '0') / 1e18).toFixed(4),
    isError: tx.isError === '1',
  }));

  return `Analyze this PulseChain wallet's recent transaction history and predict what the wallet owner will do in the next ${timeframe}.

Transaction history (last ${recentTxs.length} transactions):
${JSON.stringify(summary, null, 2)}

Total transactions: ${transactions.length}
Timeframe for prediction: ${timeframe}

Return a JSON object with exactly these fields:
{
  "probabilities": {
    "buyPls": <number 0-100>,
    "moveToDex": <number 0-100>,
    "transferOut": <number 0-100>,
    "hold": <number 0-100>,
    "other": <number 0-100>
  },
  "patternMatch": "<string describing historical pattern>",
  "riskWarnings": ["<warning1>", "<warning2>"],
  "interpretation": "<plain language paragraph>",
  "confidence": <number 0-100>
}

Probabilities must sum to 100. Be specific and data-driven.`;
}

export function parseForecastResponse(text: string): ForecastPrediction {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in response');

  const parsed = JSON.parse(jsonMatch[0]) as {
    probabilities?: {
      buyPls?: number;
      moveToDex?: number;
      transferOut?: number;
      hold?: number;
      other?: number;
    };
    patternMatch?: string;
    riskWarnings?: string[];
    interpretation?: string;
    confidence?: number;
  };

  return {
    probabilities: {
      buyPls: parsed.probabilities?.buyPls ?? 20,
      moveToDex: parsed.probabilities?.moveToDex ?? 15,
      transferOut: parsed.probabilities?.transferOut ?? 10,
      hold: parsed.probabilities?.hold ?? 45,
      other: parsed.probabilities?.other ?? 10,
    },
    patternMatch: parsed.patternMatch ?? 'Insufficient data for pattern matching',
    riskWarnings: parsed.riskWarnings ?? [],
    interpretation: parsed.interpretation ?? 'Unable to generate interpretation',
    confidence: parsed.confidence ?? 50,
  };
}

function ruleBasedFallback(transactions: Transaction[], timeframe: string): ForecastPrediction {
  const txCount = transactions.length;
  const recentTxs = transactions.slice(-10);
  const avgValue =
    recentTxs.reduce((s, tx) => s + parseInt(tx.value || '0') / 1e18, 0) / (recentTxs.length || 1);

  let buyPls = 20;
  let moveToDex = 15;
  let transferOut = 10;
  let hold = 45;
  let other = 10;

  if (txCount > 100) {
    buyPls = 30;
    moveToDex = 25;
    hold = 25;
    transferOut = 15;
    other = 5;
  } else if (txCount < 10) {
    hold = 70;
    buyPls = 10;
    moveToDex = 5;
    transferOut = 10;
    other = 5;
  }

  const confidence = Math.min(80, Math.max(20, Math.round((txCount / 200) * 80)));

  return {
    probabilities: { buyPls, moveToDex, transferOut, hold, other },
    patternMatch: `Based on ${txCount} historical transactions with average value of ${avgValue.toFixed(2)} PLS`,
    riskWarnings:
      txCount < 5 ? ['Insufficient transaction history for reliable predictions'] : [],
    interpretation: `Based on historical patterns over ${txCount} transactions, this wallet is most likely to ${hold > 50 ? 'hold' : 'trade'} in the next ${timeframe}. Confidence is ${confidence < 50 ? 'low' : 'moderate'} due to ${txCount < 20 ? 'limited' : 'moderate'} transaction history.`,
    confidence,
  };
}

export async function generateForecast(
  transactions: Transaction[],
  timeframe: string
): Promise<ForecastPrediction> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return ruleBasedFallback(transactions, timeframe);
  }

  try {
    const prompt = buildForecastPrompt(transactions, timeframe);

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system:
        'You are a blockchain behavior analyst. Analyze PulseChain wallet transaction history and provide probability predictions for what the wallet owner will do next. Focus on: patterns, sequences, timing, amounts. Always return valid JSON.',
      messages: [{ role: 'user', content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== 'text') throw new Error('Unexpected response type');

    return parseForecastResponse(content.text);
  } catch {
    return ruleBasedFallback(transactions, timeframe);
  }
}
