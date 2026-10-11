# Signal Ledger

Trading agents with a track record nobody can fake.

Every agent has an ERC-8004 identity on Monad. Before a trading call plays out, the agent commits a hash of it on-chain. After the horizon it reveals the call. A separate scorer checks the real price and writes the result into the ERC-8004 Reputation Registry. A signal that is never revealed is counted as a miss, so an agent cannot quietly drop its bad calls.

Built for Monad Metropolis, Track 4: Trust, Identity & AI Infrastructure.

## How it works

```
agent (ERC-8004 identity)                SignalLedger (Monad)            ERC-8004 Reputation Registry
  │ decide: long / short ETH-USD
  │ commit keccak(agentId, asset, dir, salt) ──▶ Committed (timestamped)
  │        … horizon passes (15 min) …
  │ reveal(asset, dir, salt) ─────────────────▶ Revealed
                                                     │
scorer (separate wallet) ◀──────────── reads ────────┘
  │ entry price at commit, exit price at horizon (Coinbase 1m candles)
  └─ giveFeedback(agentId, return %, "return", asset) ─────────────────▶ on-chain reputation
```

- **SignalLedger.sol** checks with the Identity Registry that only the agent's owner or operator commits for it.
- **Reveal window.** A call must be revealed within 1 hour after its horizon. After that anyone can mark it expired and the scorer records a miss.
- **Scorer.** ERC-8004 blocks feedback from the agent's owner, so the scorer runs from its own wallet. The feedback holds the signed return in percent with 2 decimals (37 = +0.37 %). The full scoring details sit in the `feedbackURI` as a data URI, with their keccak hash in `feedbackHash`, so anyone can re-check them.
- **Agents.** Three deliberately simple strategies: `trend`, `fade` and `claude` (asks Claude to read the last 30 minutes). The point is the honest record, not the alpha.

## Addresses (Monad testnet, chain 10143)

| Contract | Address |
| --- | --- |
| ERC-8004 Identity Registry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| ERC-8004 Reputation Registry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |
| SignalLedger | `0x1d3538DF057730a092bc726398432Ad742668d0B` |

Registry addresses are from the [erc-8004/erc-8004-contracts](https://github.com/erc-8004/erc-8004-contracts) README.

## Run it

You need Foundry, Node 20+ and two funded testnet wallets (one owns the agents, one scores). Testnet MON comes from the Monad testnet faucet (linked in the [Monad docs](https://docs.monad.xyz)).

```bash
# 1. Contract
cd contracts
forge install foundry-rs/forge-std --no-git
forge test
forge script script/Deploy.s.sol --rpc-url monad_testnet --private-key $DEPLOYER_KEY --broadcast
# verify the contract as described in the Monad docs (guides > verify a contract)

# 2. Agents and scorer
cd ../bot
cp .env.example .env   # fill in SIGNAL_LEDGER, AGENT_OWNER_KEY, SCORER_KEY, optional ANTHROPIC_API_KEY
npm install
npm run register       # mints one ERC-8004 identity per strategy
npm run agents         # terminal 1: commits every 15 min, reveals when due
npm run scorer         # terminal 2: writes reputation feedback

# 3. Leaderboard
# open web/index.html?ledger=<SIGNAL_LEDGER>&scorer=<SCORER_ADDRESS>
# or set both in CONFIG at the top of the file and deploy the folder to Vercel
```

## Status

- Testnet only. Agents trade nothing. They make calls and get scored.
- Prices come from Coinbase public candles, read off-chain by the scorer. Moving this to an on-chain oracle is the next step.
- Validation Registry (ERC-8004) is not deployed on Monad yet, so trust here comes from the reputation feedback of one independent scorer.

## Repo

```
contracts/   SignalLedger.sol, Foundry tests, deploy script
bot/         register, agents and scorer (TypeScript, viem)
web/         static leaderboard (one HTML file)
```
