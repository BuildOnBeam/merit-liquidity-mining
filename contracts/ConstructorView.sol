// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "./View.sol";

contract ConstructorView is View {
    constructor(address _account, address[] memory _oldPools, address[] memory _newPools) {
        (OldPool[] memory oldPoolsResult, Pool[] memory newPoolsResult) = fetchBoth(_account, _oldPools, _newPools);
        bytes memory result = abi.encode(oldPoolsResult, newPoolsResult);

        assembly { return(add(result, 32), mload(result)) }
    }
}