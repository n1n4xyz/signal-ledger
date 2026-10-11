// Independent scorer. Reads every signal from SignalLedger, checks the real price
// and writes the result into the ERC-8004 Reputation Registry.
// Must run from a wallet that does NOT own the agents (the registry blocks self-feedback).
// npm run scorer
import { keccak256, toBytes } from "viem";
import { reputationRegistryAbi, signalLedgerAbi, Status } from "./abi.js";
import { loadState, log, publicClient, REPUTATION_REGISTRY, REVEAL_WINDOW_SECONDS, saveState, signalLedger, sleep, walletFor } from "./config.js";
import { priceAt } from "./price.js";

const ledger = signalLedger();
const wallet = walletFor("SCORER_KEY");

type ScorerState = { done: string[] };

async function giveFeedback(agentId: bigint, value: bigint, decimals: number, tag1: string, tag2: string, details: object) {
  const json = JSON.stringify(details);
  const hash = await wallet.writeContract({
    address: REPUTATION_REGISTRY,
    abi: reputationRegistryAbi,
    functionName: "giveFeedback",
    args: [
      agentId,
      value,
      decimals,
      tag1,
      tag2,
      ledger, // endpoint: where the scored signal lives
      `data:application/json;base64,${Buffer.from(json).toString("base64")}`,
      keccak256(toBytes(json)),
    ],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

async function scoreOne(id: bigint, now: number): Promise<boolean> {
  const s = await publicClient.readContract({ address: ledger, abi: signalLedgerAbi, functionName: "getSignal", args: [id] });
  const end = Number(s.committedAt + s.horizon);

  if (s.status === Status.Committed) {
    if (now <= end + REVEAL_WINDOW_SECONDS) return false; // still waiting for the reveal
    const h = await wallet.writeContract({ address: ledger, abi: signalLedgerAbi, functionName: "markExpired", args: [id] });
    await publicClient.waitForTransactionReceipt({ hash: h });
    await giveFeedback(s.agentId, -1n, 0, "expired", "", { signalId: Number(id), agentId: Number(s.agentId), reason: "not revealed in time" });
    log(`#${id} agent ${s.agentId}: never revealed, scored as a miss`);
    return true;
  }

  if (s.status === Status.Expired) {
    await giveFeedback(s.agentId, -1n, 0, "expired", "", { signalId: Number(id), agentId: Number(s.agentId), reason: "not revealed in time" });
    return true;
  }

  if (s.status === Status.Revealed) {
    const entry = await priceAt(s.asset, Number(s.committedAt));
    const exit = await priceAt(s.asset, end);
    // Signed return in basis points, flipped for shorts. Stored with 2 decimals, so 37 means 0.37 %.
    const bps = Math.round(((exit - entry) / entry) * 10_000) * s.direction;
    const tx = await giveFeedback(s.agentId, BigInt(bps), 2, "return", s.asset, {
      signalId: Number(id),
      agentId: Number(s.agentId),
      asset: s.asset,
      direction: s.direction === 1 ? "long" : "short",
      committedAt: Number(s.committedAt),
      end,
      entry,
      exit,
      returnPct: bps / 100,
      priceSource: "Coinbase Exchange 1m candle open",
    });
    log(`#${id} agent ${s.agentId}: ${s.direction === 1 ? "long" : "short"} ${s.asset} ${entry} -> ${exit} = ${(bps / 100).toFixed(2)} % (${tx})`);
    return true;
  }
  return false;
}

async function main() {
  log(`Scorer ${wallet.account.address} watching ${ledger}`);
  for (;;) {
    const state = loadState<ScorerState>("scorer.json", { done: [] });
    const done = new Set(state.done);
    const count = await publicClient.readContract({ address: ledger, abi: signalLedgerAbi, functionName: "signalCount" });
    const now = Number((await publicClient.getBlock()).timestamp);

    for (let i = 0n; i < count; i++) {
      if (done.has(i.toString())) continue;
      try {
        if (await scoreOne(i, now)) {
          done.add(i.toString());
          saveState("scorer.json", { done: [...done] });
        }
      } catch (e) {
        log(`#${i}: scoring failed, retrying later:`, (e as Error).message.split("\n")[0]);
      }
    }
    await sleep(30_000);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
