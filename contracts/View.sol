// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "./TimeLockPool.sol";
import "./test/OldTimeLockPool.sol";

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
        address depositToken;
        Deposit[] deposits;
    }

    struct BatchResult {
        address account;
        Pool[] oldPools;
        Pool[] newPools;
    }

    function fetchData(address _account, address[] memory _pools) public view returns (Pool[] memory) {
        uint256 poolen = _pools.length;
        Pool[] memory list = new Pool[](_pools.length);
        for(uint256 i = 0; i < _pools.length; i ++) {

            TimeLockPool poolContract = TimeLockPool(_pools[i]);
            list[i] = Pool({
                poolAddress: _pools[i],
                deposits: new Deposit[](poolContract.getDepositsOfLength(_account)),
                depositToken: address(poolContract.depositToken())
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

    function fetchOldData(address _account, address[] memory _pools) public view returns (Pool[] memory) {
        Pool[] memory list = new Pool[](_pools.length);
        for(uint256 i = 0; i < _pools.length; i ++) {
            OldTimeLockPool poolContract = OldTimeLockPool(_pools[i]);

            list[i] = Pool({
                poolAddress: _pools[i],
                deposits: new Deposit[](poolContract.getDepositsOfLength(_account)),
                depositToken: address(poolContract.depositToken())
            });

            OldTimeLockPool.Deposit[] memory deposits = poolContract.getDepositsOf(_account);

            for(uint256 j = 0; j < list[i].deposits.length; j ++) {
                OldTimeLockPool.Deposit memory deposit = deposits[j];
                list[i].deposits[j] = Deposit({
                    amount: deposit.amount,
                    shareAmount: poolContract.getMultiplier(deposit.end - deposit.start) * deposit.amount / 1e18,
                    start: deposit.start,
                    end: deposit.end
                });
            }
        }
        return list;
    }

    function fetchBoth(address _account, address[] memory _oldPools, address[] memory _newPools) public view returns (Pool[] memory oldPools, Pool[] memory newPools) {
        oldPools = fetchOldData(_account, _oldPools);
        newPools = fetchData(_account, _newPools);
    }

    function fetchBothBatch(address[] memory _accounts, address[] memory _oldPools, address[] memory _newPools) public view returns (BatchResult[] memory result) {
        result = new BatchResult[](_accounts.length);

        for(uint256 i = 0; i < _accounts.length; i ++) {
            result[i].account = _accounts[i];
            result[i].oldPools = fetchOldData(_accounts[i], _oldPools);
            result[i].newPools = fetchData(_accounts[i], _newPools);
        }

        return result;
    }
}