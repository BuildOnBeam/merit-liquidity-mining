// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "./View.sol";

contract ConstructorViewBatch is View {
    constructor(address[] memory _accounts, address[] memory _oldPools, address[] memory _newPools) {
        BatchResult[] memory result = fetchBothBatch(_accounts, _oldPools, _newPools);
        bytes memory data = abi.encode(result);
        assembly { return(add(data, 32), mload(data)) }
    }
}