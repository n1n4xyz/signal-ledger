import { parseAbi } from "viem";

export const signalLedgerAbi = parseAbi([
  "struct Signal { uint256 agentId; bytes32 commitHash; uint64 committedAt; uint64 horizon; uint8 status; int8 direction; string asset; }",
  "function signalHash(uint256 agentId, string asset, int8 direction, bytes32 salt) pure returns (bytes32)",
  "function commit(uint256 agentId, bytes32 commitHash, uint64 horizon) returns (uint256 signalId)",
  "function reveal(uint256 signalId, string asset, int8 direction, bytes32 salt)",
  "function markExpired(uint256 signalId)",
  "function getSignal(uint256 signalId) view returns (Signal)",
  "function signalCount() view returns (uint256)",
  "function signalsOf(uint256 agentId) view returns (uint256[])",
  "event Committed(uint256 indexed signalId, uint256 indexed agentId, bytes32 commitHash, uint64 committedAt, uint64 horizon)",
  "event Revealed(uint256 indexed signalId, uint256 indexed agentId, string asset, int8 direction)",
  "event Expired(uint256 indexed signalId, uint256 indexed agentId)",
  "error NotAgentOperator()",
  "error BadHorizon()",
  "error WrongStatus()",
  "error TooEarly()",
  "error TooLate()",
  "error HashMismatch()",
  "error BadDirection()",
]);

// Status enum in SignalLedger
export const Status = { None: 0, Committed: 1, Revealed: 2, Expired: 3 } as const;

// Subset of the ERC-8004 Identity Registry (erc-8004/erc-8004-contracts)
export const identityRegistryAbi = parseAbi([
  "function register(string agentURI) returns (uint256 agentId)",
  "function setAgentURI(uint256 agentId, string newURI)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
]);

// Subset of the ERC-8004 Reputation Registry
export const reputationRegistryAbi = parseAbi([
  "function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)",
  "function getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)",
  "function readAllFeedback(uint256 agentId, address[] clientAddresses, string tag1, string tag2, bool includeRevoked) view returns (address[] clients, uint64[] feedbackIndexes, int128[] values, uint8[] valueDecimals, string[] tag1s, string[] tag2s, bool[] revokedStatuses)",
]);
