const BASE_URL = 'https://scan.pulsechain.com/api';

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

async function apiFetch(params: Record<string, string>): Promise<unknown> {
  const url = new URL(BASE_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    next: { revalidate: 0 },
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json() as { status: string; result: unknown };
  if (data.status === '0' && data.result === 'Max rate limit reached') {
    throw new Error('Rate limit reached');
  }
  return data.result;
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
  try {
    const result = await apiFetch({
      module: 'account',
      action: 'tokenlist',
      address,
    }) as Array<{
      contractAddress: string;
      name: string;
      symbol: string;
      balance: string;
      decimals: string;
    }>;
    if (!Array.isArray(result)) return [];
    return result.map((t) => ({
      contractAddress: t.contractAddress,
      name: t.name,
      symbol: t.symbol,
      balance: t.balance,
      decimals: t.decimals,
      usdValue: 0,
    }));
  } catch {
    return [];
  }
}

export async function fetchTransactions(address: string): Promise<Transaction[]> {
  try {
    const result = await apiFetch({
      module: 'account',
      action: 'txlist',
      address,
      sort: 'asc',
      offset: '10000',
      page: '1',
    }) as Transaction[];
    if (!Array.isArray(result)) return [];
    return result;
  } catch {
    return [];
  }
}

export async function fetchInternalTransactions(address: string): Promise<InternalTransaction[]> {
  try {
    const result = await apiFetch({
      module: 'account',
      action: 'txlistinternal',
      address,
    }) as InternalTransaction[];
    if (!Array.isArray(result)) return [];
    return result;
  } catch {
    return [];
  }
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
  const [balance, tokens, transactions, internalTransactions] = await Promise.all([
    fetchBalance(address),
    fetchTokens(address),
    fetchTransactions(address),
    fetchInternalTransactions(address),
  ]);

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
