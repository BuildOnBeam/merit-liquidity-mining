// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "./TimeLockPool.sol";

contract TimeLockNonTransferablePool is TimeLockPool {
    constructor(
        string memory _name,
        string memory _symbol,
        address _depositToken,
        address _rewardToken,
        uint256 _maxBonus,
        uint256 _maxLockDuration
    ) TimeLockPool(_name, _symbol, _depositToken, _rewardToken, _maxBonus, _maxLockDuration) {

    }

    // disable transfers
    function _transfer(address _from, address _to, uint256 _amount) internal override {
        revert("NON_TRANSFERABLE");
    }
}