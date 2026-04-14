# PROJECT STATUS - Pulse Analyzer

## Live URLs
- App: https://pulsechain.maxy.lt
- Admin: https://bk3o3t.easypanel.host

## Tech Stack
- Next.js 14, TypeScript strict, next-intl (LT/EN)
- NextAuth.js (email + password)
- PostgreSQL (direct pg, no Supabase)
- OpenAI gpt-4o-mini for AI insights
- Recharts, Framer Motion

## Infrastructure
- Server: Hetzner 46.224.83.237
- Deployment: EasyPanel (maxy-lt/pulse-analyzer service)
- GitHub: https://github.com/es4b/pulse-analyzer
- DB: pulse_analyzer database, user: maxy

## Environment Variables needed
- DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
- NEXTAUTH_SECRET, NEXTAUTH_URL
- OPENAI_API_KEY

## Database Tables
- users (id, email, password_hash, created_at)
- wallets (id, user_id UNIQUE, address, label, last_updated)
- wallet_data (id, wallet_id, raw_data jsonb, analyzed_at)
- analysis_results (id, wallet_id, metrics jsonb, behavioral_patterns jsonb, network_analysis jsonb, anomalies jsonb, created_at)
- forecast_results (id, wallet_id, timeframe, scenarios jsonb, ai_summary jsonb, computed_at)
- token_pools (token_address, pool_address, updated_at)
- token_prices (token_address, price_usd, updated_at)

## Key Features Implemented
- Email + password authentication
- Single wallet per user (UNIQUE constraint)
- PulseChain API integration (api.scan.pulsechain.com)
- Full transaction history (pagination, all pages)
- Token prices via GeckoTerminal + DexScreener fallback
- Analysis engine (lib/analysis/compute.ts):
  * Performance: PnL, win rate, expectancy, drawdown, streaks
  * Psychology: FOMO, dip buy, revenge trading, paper/diamond index
  * Strategy: DCA detection, trading style, position sizing
  * Bot detection: timing, gas, patterns, bot probability
  * Behavior: heatmap, bursts, weekly rhythm
  * Network: counterparties, circular flow
  * Token: diversity, entropy, dead tokens
  * Risk: concentration, ML risk
  * Meta scores: skill, risk, behavior, alpha (0-100)
  * Profile labels: 6 types
- Forecast engine (lib/forecast/engine.ts):
  * 8 scenarios: AFTER_LARGE_TRANSFER, AFTER_PRICE_PUMP, AFTER_INACTIVITY, AFTER_LOSS, AFTER_CONTRACT_INTERACTION, TIME_PATTERN, MULTI_SCENARIO_MERGE, BASELINE_MODE
  * Bayesian smoothing
  * Context-based baselines
  * Normalized weights
  * Entropy penalty
  * Trimmed mean time-to-event
  * Dynamic thresholds (p80/p90)
  * Scenario correlation check
  * Edge significance
  * High conviction detection
  * Regime change detection
  * Memoization 10min TTL
- AI insights via OpenAI gpt-4o-mini
- Dashboard with charts (portfolio, weekly activity, token distribution)
- Analysis tabs: Portfolio, Behavioral, Network, Anomalies, AI Insights
- Forecast page with all scenarios
- Professional sidebar with wallet card, copy button, status indicator

## API Routes
- POST /api/auth/register - registration (currently disabled)
- POST /api/auth/signin - login
- GET/POST /api/wallet - get/add wallet
- POST /api/wallet/refresh - fetch PulseChain data + compute analysis + forecast
- GET /api/analysis - get analysis results
- GET /api/forecast - get forecast results
- PATCH /api/wallet/label - update wallet label

## Data Flow
1. User clicks Refresh → POST /api/wallet/refresh
2. Fetches all transactions from PulseChain API (pagination)
3. Fetches token prices from GeckoTerminal
4. Computes full analysis (lib/analysis/compute.ts)
5. Generates AI insights (lib/ai/insights.ts)
6. Computes forecast scenarios (lib/forecast/engine.ts)
7. Saves all to PostgreSQL
8. All pages read from DB - no recalculation on page load

## PENDING TASKS
- [ ] Notifications (email via Resend, Telegram, Viber)
- [ ] Forecast page show all scenarios always (not just triggered)
- [ ] Language switching fix - all text in correct locale
- [ ] Action labels plain language (not technical names)
- [ ] Multiple wallets support (currently 1 per user)
- [ ] Token historical PnL (needs ERC-20 transfer history)
- [ ] Scam contract detection
- [ ] Bridge activity analysis
- [ ] Copy trading detection
