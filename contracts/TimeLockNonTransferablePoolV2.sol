// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "./TimeLockNonTransferablePool.sol";

contract TimeLockNonTransferablePoolV2 is TimeLockNonTransferablePool {

    function setMaxLockDuration(uint256 _maxLockDuration) external {
        require(_maxLockDuration >= MIN_LOCK_DURATION, "TimeLockPool.setMaxLockDuration: max lock duration must be greater or equal to mininmum lock duration");
        maxLockDuration = _maxLockDuration;
    }
}