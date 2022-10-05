// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import { IERC20Upgradeable as IERC20 } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable as SafeERC20 } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { AccessControlEnumerableUpgradeable as AccessControlEnumerable } from "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract TokenSaver is Initializable, AccessControlEnumerable {
    using SafeERC20 for IERC20;

    error NotTokenSaverError();
    error NotGovError();

    bytes32 public constant TOKEN_SAVER_ROLE = keccak256("TOKEN_SAVER_ROLE");
    bytes32 public constant GOV_ROLE = keccak256("GOV_ROLE");

    event TokenSaved(address indexed by, address indexed receiver, address indexed token, uint256 amount);

    modifier onlyTokenSaver() {
        if (!hasRole(TOKEN_SAVER_ROLE, _msgSender())) {
            revert NotTokenSaverError();
        }
        _;
    }

    modifier onlyGov() {
        if (!hasRole(GOV_ROLE, _msgSender())) {
            revert NotGovError();
        }
        _;
    }

    function __TokenSaver_init() internal onlyInitializing {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
    }

    /**
     * @notice Send tokens that were sent by error to this contract
     * @param _token address token to be transferred
     * @param _receiver address receiver of the tokens
     * @param _amount uint256 amount of tokens to be transferred
     */
    function saveToken(address _token, address _receiver, uint256 _amount) external onlyTokenSaver {
        IERC20(_token).safeTransfer(_receiver, _amount);
        emit TokenSaved(_msgSender(), _receiver, _token, _amount);
    }

}