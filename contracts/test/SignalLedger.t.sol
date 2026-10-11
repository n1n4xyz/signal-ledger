// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SignalLedger} from "../src/SignalLedger.sol";
import {MockIdentityRegistry} from "./MockIdentityRegistry.sol";

contract SignalLedgerTest is Test {
    SignalLedger ledger;
    MockIdentityRegistry registry;
    address agentOwner = address(0xA11CE);
    address stranger = address(0xB0B);
    uint256 constant AGENT = 7;
    bytes32 constant SALT = keccak256("salt");

    function setUp() public {
        registry = new MockIdentityRegistry();
        registry.setOwner(AGENT, agentOwner);
        ledger = new SignalLedger(address(registry));
    }

    function _commit(int8 dir) internal returns (uint256 id) {
        bytes32 h = ledger.signalHash(AGENT, "ETH-USD", dir, SALT);
        vm.prank(agentOwner);
        id = ledger.commit(AGENT, h, 15 minutes);
    }

    function test_commitAndReveal() public {
        uint256 id = _commit(1);
        vm.warp(block.timestamp + 15 minutes);
        ledger.reveal(id, "ETH-USD", 1, SALT);
        SignalLedger.Signal memory s = ledger.getSignal(id);
        assertEq(uint8(s.status), uint8(SignalLedger.Status.Revealed));
        assertEq(s.direction, 1);
        assertEq(s.asset, "ETH-USD");
    }

    function test_onlyOperatorCommits() public {
        vm.prank(stranger);
        vm.expectRevert(SignalLedger.NotAgentOperator.selector);
        ledger.commit(AGENT, bytes32(0), 15 minutes);
    }

    function test_cannotRevealEarly() public {
        uint256 id = _commit(1);
        vm.expectRevert(SignalLedger.TooEarly.selector);
        ledger.reveal(id, "ETH-USD", 1, SALT);
    }

    function test_cannotChangeDirection() public {
        uint256 id = _commit(1);
        vm.warp(block.timestamp + 15 minutes);
        vm.expectRevert(SignalLedger.HashMismatch.selector);
        ledger.reveal(id, "ETH-USD", -1, SALT);
    }

    function test_lateRevealFailsAndExpires() public {
        uint256 id = _commit(-1);
        vm.warp(block.timestamp + 15 minutes + 1 hours + 1);
        vm.expectRevert(SignalLedger.TooLate.selector);
        ledger.reveal(id, "ETH-USD", -1, SALT);
        ledger.markExpired(id);
        assertEq(uint8(ledger.getSignal(id).status), uint8(SignalLedger.Status.Expired));
    }

    function test_badHorizon() public {
        vm.prank(agentOwner);
        vm.expectRevert(SignalLedger.BadHorizon.selector);
        ledger.commit(AGENT, bytes32(0), 10);
    }
}
