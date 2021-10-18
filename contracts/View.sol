// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "./LiquidityMiningManager.sol";
import "./TimeLockPool.sol";


/// @dev reader contract to easily fetch all relevant info for an account
contract View {

    struct Data {
        uint256 pendingRewards;
        Pool[] pools;
    }

    struct Deposit {
        uint256 amount;
        uint64 start;
        uint64 end;
        uint256 multiplier;
    }

    struct Pool {
        address poolAddress;
        uint256 totalPoolShares;
        address depositToken;
        uint256 accountPendingRewards;
        uint256 accountClaimedRewards;
        uint256 accountTotalDeposit;
        uint256 accountPoolShares;
        Deposit[] deposits;
    }

    LiquidityMiningManager public immutable liquidityMiningManager;

    constructor(address _liquidityMiningManager) {
        liquidityMiningManager = LiquidityMiningManager(_liquidityMiningManager);
    }

    function fetchData(address _account) external view returns (Data memory result) {
        uint256 rewardPerSecond = liquidityMiningManager.rewardPerSecond();
        uint256 lastDistribution = liquidityMiningManager.lastDistribution();
        uint256 pendingRewards = rewardPerSecond * (block.timestamp - lastDistribution);

        LiquidityMiningManager.Pool[] memory pools = liquidityMiningManager.getPools();

        result.pools = new Pool[](pools.length);

        for(uint256 i = 0; i < pools.length; i ++) {

            TimeLockPool poolContract = TimeLockPool(address(pools[i].poolContract));

            result.pools[i] = Pool({
                poolAddress: address(pools[i].poolContract),
                totalPoolShares: poolContract.totalSupply(),
                depositToken: address(poolContract.depositToken()),
                accountPendingRewards: poolContract.withdrawableRewardsOf(_account),
                accountClaimedRewards: poolContract.withdrawnRewardsOf(_account),
                accountTotalDeposit: poolContract.getTotalDeposit(_account),
                accountPoolShares: poolContract.balanceOf(_account),
                deposits: new Deposit[](poolContract.getDepositsOfLength(_account))
            });

            TimeLockPool.Deposit[] memory deposits = poolContract.getDepositsOf(_account);

            for(uint256 j = 0; j < result.pools[i].deposits.length; j ++) {
                TimeLockPool.Deposit memory deposit = deposits[j];
                result.pools[i].deposits[i] = Deposit({
                    amount: deposit.amount,
                    start: deposit.start,
                    end: deposit.end,
                    multiplier: poolContract.getMultiplier(deposit.end - deposit.end)
                });
            } 
        }
    }

}