// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import { TransparentUpgradeableProxy as OZTransparentUpgradeableProxy } from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

contract TransparentUpgradeableProxy is OZTransparentUpgradeableProxy {
    constructor(
        address _logic,
        address admin_,
        bytes memory _data
    ) OZTransparentUpgradeableProxy(_logic, admin_, _data) {
        // empty
    }
}