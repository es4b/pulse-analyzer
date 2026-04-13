# Pulse Analyzer

Analyze PulseChain wallets and predict behavior using AI.

## Setup

1. **Clone and install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment variables**

   Copy `.env.local.example` to `.env.local` and fill in all values:

   ```bash
   cp .env.local.example .env.local
   ```

   Required variables:
   - `NEXTAUTH_SECRET` — Random secret for NextAuth.js (`openssl rand -base64 32`)
   - `NEXTAUTH_URL` — Your deployment URL (e.g. `http://localhost:3000`)
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — From Google Cloud Console
   - `APPLE_ID` / `APPLE_SECRET` — From Apple Developer account
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` — From Supabase project settings
   - `ANTHROPIC_API_KEY` — From Anthropic Console
   - `RESEND_API_KEY` — From Resend dashboard
   - `TELEGRAM_BOT_TOKEN` — From @BotFather on Telegram
   - `VIBER_AUTH_TOKEN` — From Viber partner account

3. **Set up Supabase database**

   Run `schema.sql` in your Supabase SQL editor to create all tables and Row Level Security policies.

4. **Configure OAuth providers**

   - **Google**: Create OAuth 2.0 credentials. Add `{NEXTAUTH_URL}/api/auth/callback/google` as redirect URI.
   - **Apple**: Set up Sign in with Apple. Add `{NEXTAUTH_URL}/api/auth/callback/apple` as redirect URI.

5. **Run development server**

   ```bash
   npm run dev
   ```

6. **Build for production**

   ```bash
   npm run build && npm start
   ```

## Deployment (Vercel)

1. Connect your GitHub repository to Vercel
2. Add all environment variables in Vercel project settings
3. The daily cron job (`vercel.json`) runs at midnight UTC to refresh all wallets

## Features

- **Analysis**: Portfolio metrics, behavioral patterns, network analysis, anomaly detection
- **Forecast**: AI-powered predictions for next 1h/24h/48h/7d using Claude claude-sonnet-4-6
- **Notifications**: Email (Resend), Telegram, and Viber alerts
- **i18n**: Lithuanian and English
- **Auth**: Google and Apple ID sign-in

## Tech Stack

- Next.js 14 App Router, TypeScript strict mode
- Tailwind CSS, Framer Motion, Recharts
- Supabase (PostgreSQL + Row Level Security)
- NextAuth.js, next-intl
- Anthropic Claude API, Resend
