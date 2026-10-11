# Signal Ledger - notes for Claude Code

Hackathon: Monad Metropolis, Track 4 (Trust, Identity & AI Infrastructure). Deadline 13 Oct 2026.
Submission needs: working product on Monad, demo video, short write-up, link to code.

## Layout
- contracts/src/SignalLedger.sol - commit/reveal ledger, checks ERC-8004 Identity Registry `isAuthorizedOrOwner`
- bot/src/register.ts - mints ERC-8004 identities (data: URI agent card), saves bot/state/agents.json
- bot/src/agents.ts - commit every COMMIT_EVERY_SECONDS, reveal after the horizon, salts in bot/state/pending.json
- bot/src/scorer.ts - reads signals by index (no getLogs, Monad RPC limits log ranges), writes giveFeedback
- web/index.html - static leaderboard, reads chain state only

## Rules
- The commit hash is keccak256(abi.encode(uint256 agentId, string asset, int8 direction, bytes32 salt)). TS and Solidity must stay identical.
- The scorer key must not own or operate any agent. ERC-8004 reverts with "Self-feedback not allowed".
- Feedback: tag1 "return" with value = signed return in bps and valueDecimals 2; tag1 "expired" with value -1.
- Never lose bot/state/pending.json while signals are open. Without the salt a signal expires as a miss.

## Next steps, in order
1. Deploy SignalLedger to Monad testnet, put the address in bot/.env and web/index.html CONFIG.
2. npm run register, then run agents and scorer and let them build history.
3. Deploy web/ to Vercel.
4. Optional: price from an on-chain oracle instead of Coinbase candles.
5. Optional: sell the plaintext signal before reveal over x402, so followers pay per call while the hash proves timing.
