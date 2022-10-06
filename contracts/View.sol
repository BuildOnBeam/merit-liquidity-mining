// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "./TimeLockPool.sol";
import "hardhat/console.sol";

/// @dev reader contract to easily fetch all relevant info for an account
contract View {

    struct Deposit {
        uint256 amount;
        uint256 shareAmount;
        uint64 start;
        uint64 end;
    }

    struct Pool {
        address poolAddress;
        Deposit[] deposits;
    }

    struct OldDeposit {
        uint256 amount;
        uint64 start;
        uint64 end;
        uint256 multiplier;
    }

    struct OldPool {
        address poolAddress;
        OldDeposit[] deposits;
    }

    function fetchData(address _account, address[] calldata _pools) external view returns (Pool[] memory) {
        Pool[] memory list = new Pool[](_pools.length);
        for(uint256 i = 0; i < _pools.length; i ++) {

            TimeLockPool poolContract = TimeLockPool(_pools[i]);
            list[i] = Pool({
                poolAddress: _pools[i],
                deposits: new Deposit[](poolContract.getDepositsOfLength(_account))
            });

            TimeLockPool.Deposit[] memory deposits = poolContract.getDepositsOf(_account);

            for(uint256 j = 0; j < list[i].deposits.length; j ++) {
                TimeLockPool.Deposit memory deposit = deposits[j];
                list[i].deposits[j] = Deposit({
                    amount: deposit.amount,
                    shareAmount: deposit.shareAmount,
                    start: deposit.start,
                    end: deposit.end
                });
            }
        }
        return list;
    }

    function fetchOldData(address _account, address[] calldata _pools) external view returns (OldPool[] memory) {
        OldPool[] memory list = new OldPool[](_pools.length);
        for(uint256 i = 0; i < _pools.length; i ++) {
            TimeLockPool poolContract = TimeLockPool(_pools[i]);

            list[i] = OldPool({
                poolAddress: _pools[i],
                deposits: new OldDeposit[](poolContract.getDepositsOfLength(_account))
            });

            TimeLockPool.Deposit[] memory deposits = poolContract.getDepositsOf(_account);

            for(uint256 j = 0; j < list[i].deposits.length; j ++) {
                TimeLockPool.Deposit memory deposit = deposits[j];
                list[i].deposits[j] = OldDeposit({
                    amount: deposit.amount,
                    start: deposit.start,
                    end: deposit.end,
                    multiplier: poolContract.getMultiplier(deposit.end - deposit.start)
                });
            }
        }
        return list;
    }

}