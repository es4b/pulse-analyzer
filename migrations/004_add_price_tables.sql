CREATE TABLE IF NOT EXISTS token_pools (
  token_address text PRIMARY KEY,
  pool_address text NOT NULL,
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS token_prices (
  token_address text PRIMARY KEY,
  price_usd decimal,
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_token_prices_updated ON token_prices(updated_at);
