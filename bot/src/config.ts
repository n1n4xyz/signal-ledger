import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createPublicClient, createWalletClient, defineChain, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in .env`);
  return v;
}

export const RPC_URL = process.env.RPC_URL ?? "https://testnet-rpc.monad.xyz";

export const monadTestnet = defineChain({
  id: Number(process.env.CHAIN_ID ?? 10143),
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "Monad Explorer", url: "https://testnet.monadexplorer.com" } },
});

export const IDENTITY_REGISTRY = (process.env.IDENTITY_REGISTRY ?? "0x8004A818BFB912233c491871b3d84c89A494BD9e") as Address;
export const REPUTATION_REGISTRY = (process.env.REPUTATION_REGISTRY ?? "0x8004B663056A597Dffe9eCcC1965A193B7388713") as Address;
export const signalLedger = () => need("SIGNAL_LEDGER") as Address;

export const ASSET = process.env.ASSET ?? "ETH-USD";
export const HORIZON_SECONDS = Number(process.env.HORIZON_SECONDS ?? 900);
export const COMMIT_EVERY_SECONDS = Number(process.env.COMMIT_EVERY_SECONDS ?? 900);
export const REVEAL_WINDOW_SECONDS = 3600; // must match SignalLedger.REVEAL_WINDOW

// The public Monad testnet RPC allows 15 requests per second per IP.
// Agents, scorer and the leaderboard share that budget, so retry with backoff instead of crashing.
const transport = () => http(RPC_URL, { retryCount: 6, retryDelay: 1500 });

export const publicClient = createPublicClient({ chain: monadTestnet, transport: transport() });

export function walletFor(keyEnv: "AGENT_OWNER_KEY" | "SCORER_KEY") {
  const account = privateKeyToAccount(need(keyEnv) as Hex);
  return createWalletClient({ account, chain: monadTestnet, transport: transport() });
}

// Small JSON state files so the agents and the scorer survive a restart.
const STATE_DIR = new URL("../state/", import.meta.url);
export function loadState<T>(name: string, fallback: T): T {
  const file = new URL(name, STATE_DIR);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : fallback;
}
export function saveState(name: string, value: unknown) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(new URL(name, STATE_DIR), JSON.stringify(value, null, 2));
}

export const log = (...args: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...args);
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
