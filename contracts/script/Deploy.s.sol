// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {BotBuzz} from "../src/BotBuzz.sol";

contract DeployScript is Script {
    function run() external returns (BotBuzz buzz) {
        vm.startBroadcast();
        buzz = new BotBuzz();
        vm.stopBroadcast();

        console.log("BotBuzz deployed at:", address(buzz));
    }
}
