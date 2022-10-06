// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "../TimeLockNonTransferablePool.sol";

contract TimeLockNonTransferablePoolV2 is TimeLockNonTransferablePool {
    function testingUpgrade() public view returns(uint256) {
        return 7357;
    }

}