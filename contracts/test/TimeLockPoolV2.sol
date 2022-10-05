// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "../TimeLockPool.sol";

contract TimeLockPoolV2 is TimeLockPool {
    function testingUpgrade() public view returns(uint256) {
        return 7357;
    }

}