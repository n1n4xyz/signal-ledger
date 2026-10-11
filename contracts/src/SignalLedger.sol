// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Minimal view into the ERC-8004 Identity Registry.
interface IIdentityRegistry {
    function isAuthorizedOrOwner(address spender, uint256 agentId) external view returns (bool);
}

/// @title SignalLedger
/// @notice Trading agents registered under ERC-8004 commit to a signal before it plays out
///         and reveal it afterwards. The commit timestamp is on-chain, so an agent cannot
///         backdate a call or drop the ones that went wrong.
///         Flow: commit(hash) -> horizon passes -> reveal(asset, direction, salt).
///         A signal that is not revealed in time can be marked expired by anyone and
///         counts as a miss.
contract SignalLedger {
    /// Time an agent has after the horizon ends to reveal its signal.
    uint64 public constant REVEAL_WINDOW = 1 hours;
    uint64 public constant MIN_HORIZON = 1 minutes;
    uint64 public constant MAX_HORIZON = 7 days;

    enum Status {
        None,
        Committed,
        Revealed,
        Expired
    }

    struct Signal {
        uint256 agentId;
        bytes32 commitHash;
        uint64 committedAt;
        uint64 horizon; // seconds after committedAt that the call is judged on
        Status status;
        int8 direction; // +1 long, -1 short, set on reveal
        string asset; // e.g. "ETH-USD", set on reveal
    }

    IIdentityRegistry public immutable identityRegistry;

    Signal[] private _signals;
    mapping(uint256 agentId => uint256[] signalIds) private _byAgent;

    event Committed(uint256 indexed signalId, uint256 indexed agentId, bytes32 commitHash, uint64 committedAt, uint64 horizon);
    event Revealed(uint256 indexed signalId, uint256 indexed agentId, string asset, int8 direction);
    event Expired(uint256 indexed signalId, uint256 indexed agentId);

    error NotAgentOperator();
    error BadHorizon();
    error WrongStatus();
    error TooEarly();
    error TooLate();
    error HashMismatch();
    error BadDirection();

    constructor(address identityRegistry_) {
        identityRegistry = IIdentityRegistry(identityRegistry_);
    }

    /// @notice Hash an agent must commit. Built the same way off-chain.
    function signalHash(uint256 agentId, string calldata asset, int8 direction, bytes32 salt) public pure returns (bytes32) {
        return keccak256(abi.encode(agentId, asset, direction, salt));
    }

    /// @notice Commit to a hidden signal. Only the agent's owner or an approved operator.
    function commit(uint256 agentId, bytes32 commitHash, uint64 horizon) external returns (uint256 signalId) {
        if (!identityRegistry.isAuthorizedOrOwner(msg.sender, agentId)) revert NotAgentOperator();
        if (horizon < MIN_HORIZON || horizon > MAX_HORIZON) revert BadHorizon();

        signalId = _signals.length;
        _signals.push(
            Signal({
                agentId: agentId,
                commitHash: commitHash,
                committedAt: uint64(block.timestamp),
                horizon: horizon,
                status: Status.Committed,
                direction: 0,
                asset: ""
            })
        );
        _byAgent[agentId].push(signalId);
        emit Committed(signalId, agentId, commitHash, uint64(block.timestamp), horizon);
    }

    /// @notice Reveal after the horizon has passed and before the reveal window closes.
    ///         Anyone holding the preimage can reveal, so a crashed agent does not lose a correct call.
    function reveal(uint256 signalId, string calldata asset, int8 direction, bytes32 salt) external {
        Signal storage s = _signals[signalId];
        if (s.status != Status.Committed) revert WrongStatus();
        uint64 end = s.committedAt + s.horizon;
        if (block.timestamp < end) revert TooEarly();
        if (block.timestamp > end + REVEAL_WINDOW) revert TooLate();
        if (direction != 1 && direction != -1) revert BadDirection();
        if (signalHash(s.agentId, asset, direction, salt) != s.commitHash) revert HashMismatch();

        s.status = Status.Revealed;
        s.direction = direction;
        s.asset = asset;
        emit Revealed(signalId, s.agentId, asset, direction);
    }

    /// @notice Close a signal the agent never revealed. Counts as a miss.
    function markExpired(uint256 signalId) external {
        Signal storage s = _signals[signalId];
        if (s.status != Status.Committed) revert WrongStatus();
        if (block.timestamp <= s.committedAt + s.horizon + REVEAL_WINDOW) revert TooEarly();
        s.status = Status.Expired;
        emit Expired(signalId, s.agentId);
    }

    function getSignal(uint256 signalId) external view returns (Signal memory) {
        return _signals[signalId];
    }

    function signalCount() external view returns (uint256) {
        return _signals.length;
    }

    function signalsOf(uint256 agentId) external view returns (uint256[] memory) {
        return _byAgent[agentId];
    }
}
