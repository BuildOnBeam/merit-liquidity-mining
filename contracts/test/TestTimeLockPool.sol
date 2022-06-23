// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "../TimeLockPool.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract TestBasePool is Initializable, TimeLockPool {

    constructor(        
            string memory _name,
            string memory _symbol,
            address _depositToken,
            address _rewardToken,
            address _escrowPool,
            uint256 _escrowPortion,
            uint256 _escrowDuration,
            uint256 _maxBonus,
            uint256 _maxLockDuration
    ) {
        initializeTimeLockPool(_name, _symbol, _depositToken, _rewardToken, _escrowPool, _escrowPortion, _escrowDuration, _maxBonus, _maxLockDuration);
    }

}