// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";

contract TokenSaver is AccessControlEnumerable {

    bytes32 public constant TOKEN_SAVER_ROLE = keccak256("TOKEN_SAVER_ROLE");

    modifier onlyTokenSaver() {
        // TODO implement tokenSaver role
        require(hasRole(TOKEN_SAVER_ROLE, _msgSender()), "TokenSaver.onlyTokenSaver: permission denied");
        _;
    }

    constructor() {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
    }

    function saveToken(address _token, address _receiver, uint256 _amount) external onlyTokenSaver {
        IERC20(_token).transfer(_receiver, _amount);
    }

}