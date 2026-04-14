import OpenAI from 'openai';
import type { CurrentState, AiForecastSummary, Timeframe } from './types';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function buildPrompt(
  state: CurrentState,
  timeframe: Timeframe,
  skillScore: number,
  behaviorScore: number,
  locale: string
): string {
  const responseLang = locale === 'lt' ? 'Lithuanian' : 'English';
  const activeSummary = state.activeScenarios.slice(0, 3).map((s) => ({
    name: s.name,
    id: s.id,
    confidence: s.confidence,
    priorityScore: s.priorityScore,
    trigger: s.trigger.description,
    topOutcomes: s.outcomes.slice(0, 3).map((o) => ({
      action: o.action,
      probability: o.probability,
      baseline: o.baselineProbability,
      edge: o.edge,
      isNegative: o.isNegative,
    })),
    sampleSize: s.sampleSize,
    isHighConviction: s.isHighConviction,
  }));

  return `Analyze the following PulseChain wallet forecast snapshot and return structured JSON.

TIMEFRAME: ${timeframe}
REVENGE ALERT: ${state.isRevengeAlert}
HIGH CONVICTION: ${state.isHighConviction}
WALLET PHASE: ${state.currentWalletPhase}
MARKET PHASE: ${state.currentMarketPhase}
LAST TX HOURS AGO: ${state.lastTxHoursAgo}
SKILL SCORE: ${skillScore}/100
BEHAVIOR SCORE: ${behaviorScore}/100

ACTIVE SCENARIOS:
${JSON.stringify(activeSummary, null, 2)}

Write all text fields in ${responseLang}, except summary.lt (always Lithuanian) and summary.en (always English).

Return ONLY this JSON:
{
  "mostLikelyAction": "the single most likely action in ${timeframe}",
  "timeframe": "${timeframe}",
  "riskLevel": "low" | "medium" | "high" | "critical",
  "keyPatterns": ["2-4 specific observations tied to the scenarios"],
  "contradictions": ["0-3 observations where signals disagree"],
  "negativeSignals": ["0-3 things unlikely to happen"],
  "watchPoints": ["2-3 watchpoints for a trader monitoring this wallet"],
  "confidence": 0-100,
  "summary": {
    "lt": "2-3 sakinių apibendrinimas",
    "en": "2-3 sentence summary"
  }
}`;
}

function parseResponse(text: string): AiForecastSummary {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found');
  const p = JSON.parse(jsonMatch[0]);
  const allowedRisk = ['low', 'medium', 'high', 'critical'] as const;
  const rl = allowedRisk.includes(p.riskLevel) ? p.riskLevel : 'medium';
  return {
    mostLikelyAction: p.mostLikelyAction ?? '',
    timeframe: p.timeframe ?? '',
    riskLevel: rl,
    keyPatterns: Array.isArray(p.keyPatterns) ? p.keyPatterns : [],
    contradictions: Array.isArray(p.contradictions) ? p.contradictions : [],
    negativeSignals: Array.isArray(p.negativeSignals) ? p.negativeSignals : [],
    watchPoints: Array.isArray(p.watchPoints) ? p.watchPoints : [],
    confidence: typeof p.confidence === 'number' ? p.confidence : 50,
    summary: {
      lt: p.summary?.lt ?? '',
      en: p.summary?.en ?? '',
    },
  };
}

export async function generateForecastSummary(
  state: CurrentState,
  timeframe: Timeframe,
  skillScore: number,
  behaviorScore: number,
  locale: string
): Promise<AiForecastSummary | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const prompt = buildPrompt(state, timeframe, skillScore, behaviorScore, locale);
    const system = `You are a blockchain behavior analyst. Analyze wallet patterns and provide a structured forecast.
If skill_score < 40: predict higher error probability after triggers.
If behavior_score < 40: predict more impulsive actions.
If revenge_alert is true: emphasize emotional trading risk prominently.

STRICT RULES:
- DO NOT invent actions not present in the scenario data
- DO NOT contradict scenario probabilities by more than 15%
- If scenarios show conflicting signals, acknowledge uncertainty
- Base all predictions ONLY on the provided scenario data

Respond ONLY in valid JSON, no markdown. Write text in ${locale === 'lt' ? 'Lithuanian' : 'English'}, except summary.lt (Lithuanian) and summary.en (English).`;
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1500,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    });
    const text = completion.choices[0]?.message?.content;
    if (!text) throw new Error('Empty response');
    return parseResponse(text);
  } catch (err) {
    console.error('[forecast AI]', err);
    return null;
  }
}
