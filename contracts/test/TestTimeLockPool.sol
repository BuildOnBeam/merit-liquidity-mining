// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "../TimeLockPool.sol";

contract TestTimeLockPool is TimeLockPool {

    constructor(
        string memory _name,
        string memory _symbol,
        address _depositToken,
        address _rewardToken,
        address _escrowPool,
        uint256 _escrowPortion,
        uint256 _escrowDuration,
        uint256 _maxBonus,
        uint256 _maxLockDuration,
        uint256[] memory _curve
    ) public initializer {
        initializeTest(_name, _symbol, _depositToken, _rewardToken, _escrowPool, _escrowPortion, _escrowDuration, _maxBonus, _maxLockDuration, _curve);
    }

    function initializeTest(
        string memory _name,
        string memory _symbol,
        address _depositToken,
        address _rewardToken,
        address _escrowPool,
        uint256 _escrowPortion,
        uint256 _escrowDuration,
        uint256 _maxBonus,
        uint256 _maxLockDuration,
        uint256[] memory _curve
    ) public initializer {
        __TimeLockPool_init(_name, _symbol, _depositToken, _rewardToken, _escrowPool, _escrowPortion, _escrowDuration, _maxBonus, _maxLockDuration, _curve);
    }

}