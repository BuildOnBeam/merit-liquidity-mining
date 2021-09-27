// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";

abstract contract BasePool is ERC20Votes {
    IERC20 depositToken;

    constructor(string memory _name, string memory _symbol, address _depositToken) ERC20Permit(_name) ERC20(_name, _symbol) {
        depositToken = IERC20(_depositToken);
    }

    function _transfer (
        address sender,
        address recipient,
        uint256 amount
    ) internal override {
        revert("NON_TRANSFERABLE");
    }

}