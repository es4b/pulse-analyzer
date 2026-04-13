CREATE TABLE users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  telegram_chat_id text,
  viber_user_id text,
  notify_email boolean default true,
  notify_telegram boolean default false,
  notify_viber boolean default false,
  large_tx_threshold decimal default 10000,
  created_at timestamp default now()
);

CREATE TABLE wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade UNIQUE,
  address text not null,
  label text,
  last_updated timestamp,
  created_at timestamp default now()
);

CREATE TABLE wallet_data (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid references wallets(id) on delete cascade,
  raw_data jsonb,
  analyzed_at timestamp default now()
);

CREATE TABLE analysis_results (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid references wallets(id) on delete cascade,
  metrics jsonb,
  behavioral_patterns jsonb,
  network_analysis jsonb,
  anomalies jsonb,
  created_at timestamp default now()
);

CREATE TABLE forecast_results (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid references wallets(id) on delete cascade,
  timeframe text,
  probability decimal,
  prediction jsonb,
  confidence decimal,
  created_at timestamp default now()
);

CREATE TABLE notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  type text,
  message text,
  sent_at timestamp default now(),
  channel text
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only see own data" ON users FOR ALL USING (auth.uid() = id);
CREATE POLICY "Users can only see own wallets" ON wallets FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can only see own wallet_data" ON wallet_data FOR ALL USING (wallet_id IN (SELECT id FROM wallets WHERE user_id = auth.uid()));
CREATE POLICY "Users can only see own analysis" ON analysis_results FOR ALL USING (wallet_id IN (SELECT id FROM wallets WHERE user_id = auth.uid()));
CREATE POLICY "Users can only see own forecasts" ON forecast_results FOR ALL USING (wallet_id IN (SELECT id FROM wallets WHERE user_id = auth.uid()));
CREATE POLICY "Users can only see own notifications" ON notifications FOR ALL USING (auth.uid() = user_id);
