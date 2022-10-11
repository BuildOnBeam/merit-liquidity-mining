// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "./View.sol";

contract ConstructorView is View {
    constructor(address _account, address[] memory _oldPools, address[] memory _newPools) {
        (OldPool[] memory oldPoolsResult, Pool[] memory newPoolsResult) = fetchBoth(_account, _oldPools, _newPools);
        bytes memory result = abi.encode(oldPoolsResult, newPoolsResult);

        assembly { return(add(result, 32), mload(result)) }
    }

    function _getRevertMsg(bytes memory _returnData) internal pure returns (string memory) {
        // If the _res length is less than 68, then the transaction failed silently (without a revert message)
        if (_returnData.length < 68) return "Transaction reverted silently";

        assembly {
            // Slice the sighash.
            _returnData := add(_returnData, 0x04)
        }
        return abi.decode(_returnData, (string)); // All that remains is the revert string
    }
}