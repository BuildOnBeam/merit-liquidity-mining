// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IBasePool.sol";
import "./base/TokenSaver.sol";

contract LiquidityMiningManager is TokenSaver {

    IERC20 immutable public reward;
    address immutable public rewardSource;
    uint256 public rewardPerSecond; //total reward amount per second
    uint256 public lastDistribution; //when rewards were last pushed
    uint256 public totalWeight;

    mapping(address => bool) public poolAdded;
    Pool[] public pools;

    struct Pool {
        IBasePool poolContract;
        uint256 weight;
    }

    modifier onlyGov {
        // TODO check gov role
        _;
    }

    constructor(address _reward, address _rewardSource) {
        reward = IERC20(_reward);
        rewardSource = _rewardSource;
    }

    function addPool(address _poolContract, uint256 _weight) external onlyGov {
        distributeRewards();
        require(!poolAdded[_poolContract], "LiquidityMiningManager.addPool: Pool already added");
        // add pool
        pools.push(Pool({
            poolContract: IBasePool(_poolContract),
            weight: _weight
        }));
        poolAdded[_poolContract] = true;
        
        // increase totalWeight
        totalWeight += _weight;

        // Approve max token amount
        reward.approve(_poolContract, type(uint256).max);
    }

    function removePool(uint256 _poolId) external onlyGov {
        distributeRewards();
        address poolAddress = address(pools[_poolId].poolContract);
        require(poolAdded[poolAddress], "LiquidityMiningManager.removePool: Pool not known");
        
        // remove pool
        pools[_poolId] = pools[pools.length - 1];
        pools.pop();
        poolAdded[poolAddress] = false;

        // decrease totalWeight
    }

    function adjustWeight(uint256 _poolId, uint256 _newWeight) external onlyGov {
        distributeRewards();
        Pool storage pool = pools[_poolId];

        totalWeight -= pool.weight;
        totalWeight += _newWeight;

        pool.weight = _newWeight;
    }

    function setRewardPerSecond(uint256 _rewardPerSecond) external onlyGov {
        distributeRewards();
        rewardPerSecond = _rewardPerSecond;
    }

    function getPools() external view returns(Pool[] memory result) {
        return pools;
    }

    function distributeRewards() public {
        uint256 timePassed = block.timestamp - lastDistribution;
        uint256 totalRewardAmount = rewardPerSecond * timePassed;
        lastDistribution = block.timestamp;

        reward.transferFrom(rewardSource, address(this), totalRewardAmount);

        for(uint256 i = 0; i < pools.length; i ++) {
            Pool memory pool = pools[i];
            uint256 poolRewardAmount = totalRewardAmount * pool.weight / totalWeight;
            // ignore tx failing
            address(pool.poolContract).call(abi.encodeWithSelector(pool.poolContract.distributeRewards.selector, poolRewardAmount));
        }
    }

}