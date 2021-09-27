// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract LiquidityMiningManager {

    IERC20 immutable reward;
    uint256 public rewardPerSecond; //total reward amount per second
    uint256 public totalWeight;

    mapping(address => bool) public poolAdded;
    Pool[] public pools;

    struct Pool {
        address poolContract;
        uint256 weight;
    }

    modifier onlyGov {
        // TODO check gov role
        _;
    }

    constructor(address _reward) {
        reward = IERC20(_reward);
    }

    function addPool(address _poolContract, uint256 _weight) external onlyGov {
        require(!poolAdded[_poolContract], "LiquidityMiningManager.addPool: Pool already added");
        // add pool
        pools.push(Pool({
            poolContract: _poolContract,
            weight: _weight
        }));
        poolAdded[_poolContract] = true;
        
        // increase totalWeight
        totalWeight += _weight;
    }

    function removePool(uint256 _poolId) external onlyGov {
        address poolAddress = pools[_poolId].poolContract;
        require(poolAdded[poolAddress], "LiquidityMiningManager.removePool: Pool not known");
        
        // remove pool
        pools[_poolId] = pools[pools.length - 1];
        pools.pop();
        poolAdded[poolAddress] = false;

        // decrease totalWeight
    }

    function adjustWeight(uint256 _poolId, uint256 _newWeight) external onlyGov {
        Pool storage pool = pools[_poolId];

        totalWeight -= pool.weight;
        totalWeight += _newWeight;

        pool.weight = _newWeight;
    }

    function setRewardPerSecond(uint256 _rewardPerSecond) external onlyGov {
        rewardPerSecond = _rewardPerSecond;
    }

    function getPools() external view returns(Pool[] memory result) {
        return pools;
    }

}