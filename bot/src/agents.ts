// Runs every registered agent: commit a hidden signal, then reveal it once the horizon has passed.
// npm run agents
import { decodeEventLog, encodeAbiParameters, keccak256, toHex, type Hex } from "viem";
import { randomBytes } from "node:crypto";
import { signalLedgerAbi } from "./abi.js";
import { ASSET, COMMIT_EVERY_SECONDS, HORIZON_SECONDS, loadState, log, publicClient, saveState, signalLedger, sleep, walletFor } from "./config.js";
import { recentCloses } from "./price.js";
import { STRATEGIES, type Direction } from "./strategies.js";
import type { AgentRecord } from "./register.js";

type Pending = { signalId: string; agentId: string; asset: string; direction: Direction; salt: Hex; revealAfter: number };

const ledger = signalLedger();
const wallet = walletFor("AGENT_OWNER_KEY");

/** Same as SignalLedger.signalHash: keccak256(abi.encode(agentId, asset, direction, salt)) */
function signalHash(agentId: bigint, asset: string, direction: Direction, salt: Hex): Hex {
  return keccak256(
    encodeAbiParameters([{ type: "uint256" }, { type: "string" }, { type: "int8" }, { type: "bytes32" }], [agentId, asset, direction, salt]),
  );
}

async function commitFor(agent: AgentRecord, closes: number[]) {
  const direction = await STRATEGIES[agent.strategy].decide(closes);
  const salt = toHex(randomBytes(32));
  const agentId = BigInt(agent.agentId);

  const hash = await wallet.writeContract({
    address: ledger,
    abi: signalLedgerAbi,
    functionName: "commit",
    args: [agentId, signalHash(agentId, ASSET, direction, salt), BigInt(HORIZON_SECONDS)],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const ev = receipt.logs
    .filter((l) => l.address.toLowerCase() === ledger.toLowerCase())
    .map((l) => decodeEventLog({ abi: signalLedgerAbi, ...l }))
    .find((e) => e.eventName === "Committed");
  if (!ev || ev.eventName !== "Committed") throw new Error(`No Committed event in ${hash}`);

  const p: Pending = {
    signalId: ev.args.signalId.toString(),
    agentId: agent.agentId,
    asset: ASSET,
    direction,
    salt,
    revealAfter: Number(ev.args.committedAt + ev.args.horizon),
  };
  // The salt only lives here until reveal. Lose it and the signal expires as a miss.
  saveState("pending.json", [...loadState<Pending[]>("pending.json", []), p]);
  log(`${agent.name}: committed signal #${p.signalId} (hidden until reveal)`);
}

async function revealDue() {
  const pending = loadState<Pending[]>("pending.json", []);
  const block = await publicClient.getBlock();
  const now = Number(block.timestamp);
  const left: Pending[] = [];
  for (const p of pending) {
    if (now < p.revealAfter) {
      left.push(p);
      continue;
    }
    try {
      const hash = await wallet.writeContract({
        address: ledger,
        abi: signalLedgerAbi,
        functionName: "reveal",
        args: [BigInt(p.signalId), p.asset, p.direction, p.salt],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      log(`Revealed #${p.signalId}: ${p.direction === 1 ? "long" : "short"} ${p.asset}`);
    } catch (e) {
      log(`Reveal #${p.signalId} failed, retrying next round:`, (e as Error).message.split("\n")[0]);
      left.push(p);
    }
  }
  saveState("pending.json", left);
}

async function main() {
  const agents = loadState<AgentRecord[]>("agents.json", []);
  if (!agents.length) throw new Error("No agents yet. Run: npm run register");
  log(`Running ${agents.length} agents on ${ASSET}, horizon ${HORIZON_SECONDS}s, new signal every ${COMMIT_EVERY_SECONDS}s`);

  let nextCommit = 0;
  for (;;) {
    if (Date.now() >= nextCommit) {
      nextCommit = Date.now() + COMMIT_EVERY_SECONDS * 1000;
      const closes = await recentCloses(ASSET, 30);
      for (const a of agents) {
        try {
          await commitFor(a, closes);
        } catch (e) {
          log(`${a.name}: commit failed:`, (e as Error).message.split("\n")[0]);
        }
      }
    }
    await revealDue();
    await sleep(15_000);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
