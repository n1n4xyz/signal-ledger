// Registers one ERC-8004 identity per strategy on Monad testnet.
// Run once: npm run register
import { decodeEventLog } from "viem";
import { identityRegistryAbi } from "./abi.js";
import { IDENTITY_REGISTRY, loadState, log, monadTestnet, publicClient, saveState, walletFor } from "./config.js";
import { STRATEGIES, type StrategyName } from "./strategies.js";

export type AgentRecord = { agentId: string; name: string; strategy: StrategyName };

function registrationFile(name: string, description: string, agentId?: bigint) {
  const file = {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name,
    description,
    image: "",
    services: [{ name: "signal-ledger", endpoint: process.env.SIGNAL_LEDGER ?? "" }],
    x402Support: false,
    active: true,
    registrations: agentId === undefined ? [] : [{ agentId: Number(agentId), agentRegistry: `eip155:${monadTestnet.id}:${IDENTITY_REGISTRY}` }],
    supportedTrust: ["reputation"],
  };
  // Fully on-chain agent card, no IPFS needed
  return `data:application/json;base64,${Buffer.from(JSON.stringify(file)).toString("base64")}`;
}

async function main() {
  const wallet = walletFor("AGENT_OWNER_KEY");
  const existing = loadState<AgentRecord[]>("agents.json", []);
  const wanted = (Object.keys(STRATEGIES) as StrategyName[]).filter((s) => !existing.some((a) => a.strategy === s));
  if (!process.env.ANTHROPIC_API_KEY) {
    const i = wanted.indexOf("claude");
    if (i >= 0) wanted.splice(i, 1), log("No ANTHROPIC_API_KEY, skipping the claude agent");
  }

  for (const strategy of wanted) {
    const name = `SignalLedger ${strategy}`;
    const { description } = STRATEGIES[strategy];

    const hash = await wallet.writeContract({
      address: IDENTITY_REGISTRY,
      abi: identityRegistryAbi,
      functionName: "register",
      args: [registrationFile(name, description)],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const event = receipt.logs
      .filter((l) => l.address.toLowerCase() === IDENTITY_REGISTRY.toLowerCase())
      .map((l) => {
        try {
          return decodeEventLog({ abi: identityRegistryAbi, ...l });
        } catch {
          return null;
        }
      })
      .find((e) => e?.eventName === "Registered");
    if (!event || event.eventName !== "Registered") throw new Error(`No Registered event in ${hash}`);
    const agentId = event.args.agentId;

    // Second write: put the agentId into the card, as the ERC-8004 spec asks
    const h2 = await wallet.writeContract({
      address: IDENTITY_REGISTRY,
      abi: identityRegistryAbi,
      functionName: "setAgentURI",
      args: [agentId, registrationFile(name, description, agentId)],
    });
    await publicClient.waitForTransactionReceipt({ hash: h2 });

    existing.push({ agentId: agentId.toString(), name, strategy });
    saveState("agents.json", existing);
    log(`Registered ${name} as agent #${agentId} (${monadTestnet.blockExplorers.default.url}/tx/${hash})`);
  }
  log("Agents:", existing);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
