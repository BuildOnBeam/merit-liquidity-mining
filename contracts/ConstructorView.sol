// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "./View.sol";

contract ConstructorView is View {
    constructor(address _account, address[] memory _oldPools, address[] memory _newPools) {
        OldPool[] memory oldPools = fetchOldData(_account, _oldPools);
        Pool[] memory newPools = fetchData(_account, _newPools);

        bytes memory result = abi.encode(oldPools, newPools);
        assembly { return(add(result, 32), mload(result)) }
    }
}