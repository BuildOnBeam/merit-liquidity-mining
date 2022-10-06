// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import { IERC20Upgradeable as IERC20 } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable as SafeERC20 } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { ERC20VotesUpgradeable as ERC20Votes } from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20VotesUpgradeable.sol";
import { SafeCastUpgradeable as SafeCast } from "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";
import { AccessControlEnumerableUpgradeable as AccessControlEnumerable } from "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "../interfaces/IBasePool.sol";
import "../interfaces/ITimeLockPool.sol";

import "./AbstractRewards.sol";
import "./BoringBatchable.sol";

abstract contract BasePool is Initializable, AccessControlEnumerable, ERC20Votes, AbstractRewards, IBasePool, BaseBoringBatchable {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;
    using SafeCast for int256;

    error MoreThanOneError();
    error NoDepositTokenError();
    error NotGovError();

    IERC20 public depositToken;
    IERC20 public rewardToken;
    ITimeLockPool public escrowPool;
    uint256 public escrowPortion; // how much is escrowed 1e18 == 100%
    uint256 public escrowDuration; // escrow duration in seconds

    bytes32 public constant GOV_ROLE = keccak256("GOV_ROLE");

    event RewardsClaimed(address indexed _from, address indexed _receiver, uint256 _escrowedAmount, uint256 _nonEscrowedAmount);

    // Saves space calling _onlyGov instead having the code
    modifier onlyGov() {
        _onlyGov();
        _;
    }
    
    function _onlyGov() private view {
        if (!hasRole(GOV_ROLE, _msgSender())) {
            revert NotGovError();
        }
    }

    function __BasePool_init(
        string memory _name,
        string memory _symbol,
        address _depositToken,
        address _rewardToken,
        address _escrowPool,
        uint256 _escrowPortion,
        uint256 _escrowDuration
    ) internal onlyInitializing {
        __ERC20Permit_init(_name); // only initializes ERC712Permit
        __ERC20_init(_name, _symbol); // unchained or not it only saves the variables
        __AbstractRewards_init(balanceOf, totalSupply);
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
        __AccessControlEnumerable_init();

        if (_escrowPortion > 1e18) {
            revert MoreThanOneError();
        }
        if (_depositToken == address(0)) {
            revert NoDepositTokenError();
        }
        depositToken = IERC20(_depositToken);
        rewardToken = IERC20(_rewardToken);
        escrowPool = ITimeLockPool(_escrowPool);
        escrowPortion = _escrowPortion;
        escrowDuration = _escrowDuration;

        if(_rewardToken != address(0) && _escrowPool != address(0)) {
            IERC20(_rewardToken).safeApprove(_escrowPool, type(uint256).max);
        }
    }

    function _mint(address _account, uint256 _amount) internal virtual override {
		super._mint(_account, _amount);
        _correctPoints(_account, -(_amount.toInt256()));
	}
	
	function _burn(address _account, uint256 _amount) internal virtual override {
		super._burn(_account, _amount);
        _correctPoints(_account, _amount.toInt256());
	}

    function _transfer(address _from, address _to, uint256 _value) internal virtual override {
		super._transfer(_from, _to, _value);
        _correctPointsForTransfer(_from, _to, _value);
	}

    function distributeRewards(uint256 _amount) external override {
        rewardToken.safeTransferFrom(_msgSender(), address(this), _amount);
        _distributeRewards(_amount);
    }

    function claimRewards(address _receiver) external {
        uint256 rewardAmount = _prepareCollect(_msgSender());
        uint256 escrowedRewardAmount = rewardAmount * escrowPortion / 1e18;
        uint256 nonEscrowedRewardAmount = rewardAmount - escrowedRewardAmount;

        if(escrowedRewardAmount != 0 && address(escrowPool) != address(0)) {
            escrowPool.deposit(escrowedRewardAmount, escrowDuration, _receiver);
        }

        // ignore dust
        if(nonEscrowedRewardAmount > 1) {
            rewardToken.safeTransfer(_receiver, nonEscrowedRewardAmount);
        }

        emit RewardsClaimed(_msgSender(), _receiver, escrowedRewardAmount, nonEscrowedRewardAmount);
    }

}