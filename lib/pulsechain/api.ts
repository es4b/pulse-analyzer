const BASE_URL = 'https://api.scan.pulsechain.com/api';

export interface BalanceResult {
  balance: string;
  balancePls: number;
}

export interface TokenResult {
  contractAddress: string;
  name: string;
  symbol: string;
  balance: string;
  decimals: string;
  usdValue: number;
}

export interface Transaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  gas: string;
  gasPrice: string;
  gasUsed: string;
  timeStamp: string;
  isError: string;
  input: string;
  blockNumber: string;
}

export interface InternalTransaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  timeStamp: string;
  type: string;
}

export interface GasFees {
  totalPls: number;
  totalUsd: number;
}

export interface WalletActivity {
  firstTxDate: Date | null;
  lastTxDate: Date | null;
  totalTxCount: number;
}

const API_PAGE_SIZE = 250;
const API_DELAY_MS = 2000;
const MAX_TOKENS = 500;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

async function apiFetch(params: Record<string, string>): Promise<unknown> {
  const url = new URL(BASE_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url.toString(), {
      next: { revalidate: 0 },
      headers: { Accept: 'application/json' },
    });

    if (res.status === 429) {
      console.log(`[apiFetch] 429 rate limited (attempt ${attempt}/${MAX_RETRIES}), waiting ${RETRY_DELAY_MS}ms...`);
      if (attempt < MAX_RETRIES) {
        await delay(RETRY_DELAY_MS * attempt);
        continue;
      }
      throw new Error('Rate limit reached after retries');
    }

    if (!res.ok) throw new Error(`API error: ${res.status}`);

    const data = await res.json() as { status: string; message: string; result: unknown };

    if (data.status === '0') {
      const msg = typeof data.result === 'string' ? data.result : data.message;
      if (msg?.includes('rate limit') || msg?.includes('Rate limit')) {
        console.log(`[apiFetch] rate limit in body (attempt ${attempt}/${MAX_RETRIES}): ${msg}`);
        if (attempt < MAX_RETRIES) {
          await delay(RETRY_DELAY_MS * attempt);
          continue;
        }
        throw new Error('Rate limit reached after retries');
      }
      // status 0 with non-rate-limit message means no more data
      console.log(`[apiFetch] status=0, result=${JSON.stringify(data.result).slice(0, 100)}`);
      return [];
    }

    return data.result;
  }

  throw new Error('Max retries exhausted');
}

export async function fetchBalance(address: string): Promise<BalanceResult> {
  try {
    const result = await apiFetch({
      module: 'account',
      action: 'balance',
      address,
    }) as string;
    const balancePls = parseInt(result || '0') / 1e18;
    return { balance: result || '0', balancePls };
  } catch {
    return { balance: '0', balancePls: 0 };
  }
}

export async function fetchTokens(address: string): Promise<TokenResult[]> {
  const all: TokenResult[] = [];
  let page = 1;

  try {
    while (true) {
      const result = await apiFetch({
        module: 'account',
        action: 'tokenlist',
        address,
        offset: String(API_PAGE_SIZE),
        page: String(page),
      }) as Array<{
        contractAddress: string;
        name: string;
        symbol: string;
        balance: string;
        decimals: string;
      }>;
      const isArray = Array.isArray(result);
      const len = isArray ? result.length : 0;
      console.log(`[fetchTokens] page ${page}: isArray=${isArray}, length=${len}, type=${typeof result}`);
      if (!isArray || len === 0) {
        console.log(`[fetchTokens] stopping: isArray=${isArray}, length=${len}`);
        break;
      }
      all.push(...result.map((t) => ({
        contractAddress: t.contractAddress,
        name: t.name,
        symbol: t.symbol,
        balance: t.balance,
        decimals: t.decimals,
        usdValue: 0,
      })));
      console.log(`[fetchTokens] page ${page}: ${len} tokens (total: ${all.length})`);
      if (all.length >= MAX_TOKENS) {
        console.log(`[fetchTokens] reached MAX_TOKENS cap (${MAX_TOKENS}), stopping`);
        all.length = MAX_TOKENS;
        break;
      }
      page++;
      await delay(API_DELAY_MS);
    }
  } catch (err) {
    console.error(`[fetchTokens] error on page ${page}, collected ${all.length} so far:`, err);
  }

  console.log(`[fetchTokens] done — ${all.length} tokens total across ${page - 1} pages`);
  return all;
}

export async function fetchTransactions(address: string): Promise<Transaction[]> {
  const all: Transaction[] = [];
  let page = 1;

  try {
    while (true) {
      const result = await apiFetch({
        module: 'account',
        action: 'txlist',
        address,
        sort: 'asc',
        offset: String(API_PAGE_SIZE),
        page: String(page),
      }) as Transaction[];
      const isArray = Array.isArray(result);
      const len = isArray ? result.length : 0;
      console.log(`[fetchTransactions] page ${page}: isArray=${isArray}, length=${len}, type=${typeof result}`);
      if (!isArray || len === 0) {
        console.log(`[fetchTransactions] stopping: isArray=${isArray}, length=${len}`);
        break;
      }
      all.push(...result);
      console.log(`[fetchTransactions] page ${page}: ${len} txs (total: ${all.length})`);
      page++;
      await delay(API_DELAY_MS);
    }
  } catch (err) {
    console.error(`[fetchTransactions] error on page ${page}, collected ${all.length} so far:`, err);
  }

  console.log(`[fetchTransactions] done — ${all.length} txs total across ${page - 1} pages`);
  return all;
}

export async function fetchInternalTransactions(address: string): Promise<InternalTransaction[]> {
  const all: InternalTransaction[] = [];
  let page = 1;

  try {
    while (true) {
      const result = await apiFetch({
        module: 'account',
        action: 'txlistinternal',
        address,
        sort: 'asc',
        offset: String(API_PAGE_SIZE),
        page: String(page),
      }) as InternalTransaction[];
      const isArray = Array.isArray(result);
      const len = isArray ? result.length : 0;
      console.log(`[fetchInternalTxs] page ${page}: isArray=${isArray}, length=${len}, type=${typeof result}`);
      if (!isArray || len === 0) {
        console.log(`[fetchInternalTxs] stopping: isArray=${isArray}, length=${len}`);
        break;
      }
      all.push(...result);
      console.log(`[fetchInternalTxs] page ${page}: ${len} txs (total: ${all.length})`);
      page++;
      await delay(API_DELAY_MS);
    }
  } catch (err) {
    console.error(`[fetchInternalTxs] error on page ${page}, collected ${all.length} so far:`, err);
  }

  console.log(`[fetchInternalTxs] done — ${all.length} txs total across ${page - 1} pages`);
  return all;
}

export function calculateGasFees(transactions: Transaction[]): GasFees {
  let totalWei = BigInt(0);
  for (const tx of transactions) {
    const gasUsed = BigInt(tx.gasUsed || '0');
    const gasPrice = BigInt(tx.gasPrice || '0');
    totalWei += gasUsed * gasPrice;
  }
  const totalPls = Number(totalWei) / 1e18;
  const totalUsd = totalPls * 0.0001;
  return { totalPls, totalUsd };
}

export function calculateActivity(transactions: Transaction[]): WalletActivity {
  if (!transactions.length) {
    return { firstTxDate: null, lastTxDate: null, totalTxCount: 0 };
  }
  const timestamps = transactions.map((tx) => parseInt(tx.timeStamp) * 1000);
  return {
    firstTxDate: new Date(Math.min(...timestamps)),
    lastTxDate: new Date(Math.max(...timestamps)),
    totalTxCount: transactions.length,
  };
}

export async function fetchAllWalletData(address: string) {
  const balance = await fetchBalance(address);

  await delay(3000);
  const tokens = await fetchTokens(address);

  await delay(3000);
  const transactions = await fetchTransactions(address);

  await delay(3000);
  const internalTransactions = await fetchInternalTransactions(address);

  const gasFees = calculateGasFees(transactions);
  const activity = calculateActivity(transactions);

  return {
    balance,
    tokens,
    transactions,
    internalTransactions,
    gasFees,
    activity,
  };
}
