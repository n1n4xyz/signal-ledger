// Prices come from Coinbase Exchange public 1-minute candles. No API key needed.
// Anyone can re-run the same lookup for a given timestamp, so the scoring is reproducible.
// Candle row format: [time, low, high, open, close, volume], newest first.

type Candle = [number, number, number, number, number, number];
const BASE = "https://api.exchange.coinbase.com/products";

async function candles(asset: string, startSec: number, endSec: number): Promise<Candle[]> {
  const url = `${BASE}/${asset}/candles?granularity=60&start=${new Date(startSec * 1000).toISOString()}&end=${new Date(endSec * 1000).toISOString()}`;
  const res = await fetch(url, { headers: { "User-Agent": "signal-ledger" } });
  if (!res.ok) throw new Error(`Coinbase ${res.status} for ${url}`);
  return (await res.json()) as Candle[];
}

/** Price at a unix timestamp: open of the 1-minute candle that contains it. */
export async function priceAt(asset: string, tSec: number): Promise<number> {
  const minute = Math.floor(tSec / 60) * 60;
  // Ask for a 10-minute window so a minute without trades falls back to the last earlier candle.
  const rows = await candles(asset, minute - 540, minute + 60);
  const before = rows.filter((c) => c[0] <= minute).sort((a, b) => b[0] - a[0]);
  if (!before.length) throw new Error(`No candle for ${asset} at ${minute}`);
  return before[0][3];
}

/** Last n one-minute closes, oldest first. Used by the strategies. */
export async function recentCloses(asset: string, n = 30): Promise<number[]> {
  const now = Math.floor(Date.now() / 1000);
  const rows = await candles(asset, now - n * 60, now);
  return rows.sort((a, b) => a[0] - b[0]).map((c) => c[4]);
}
