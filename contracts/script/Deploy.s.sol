// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SignalLedger} from "../src/SignalLedger.sol";

/// forge script script/Deploy.s.sol --rpc-url monad_testnet --private-key $DEPLOYER_KEY --broadcast
contract Deploy is Script {
    // ERC-8004 Identity Registry on Monad testnet (from erc-8004/erc-8004-contracts README)
    address constant IDENTITY_REGISTRY_TESTNET = 0x8004A818BFB912233c491871b3d84c89A494BD9e;

    function run() external {
        address registry = vm.envOr("IDENTITY_REGISTRY", IDENTITY_REGISTRY_TESTNET);
        vm.startBroadcast();
        SignalLedger ledger = new SignalLedger(registry);
        vm.stopBroadcast();
        console.log("SignalLedger:", address(ledger));
    }
}
