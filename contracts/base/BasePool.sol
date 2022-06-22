// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20VotesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";

import "../interfaces/IBasePool.sol";
import "../interfaces/ITimeLockPool.sol";

import "./AbstractRewards.sol";
import "./TokenSaver.sol";

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

abstract contract BasePool is Initializable, ERC20VotesUpgradeable, AbstractRewards, IBasePool, TokenSaver {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using SafeCastUpgradeable for uint256;
    using SafeCastUpgradeable for int256;

    IERC20Upgradeable public depositToken;
    IERC20Upgradeable public rewardToken;
    ITimeLockPool public escrowPool;
    uint256 public escrowPortion; // how much is escrowed 1e18 == 100%
    uint256 public escrowDuration; // escrow duration in seconds

    event RewardsClaimed(address indexed _from, address indexed _receiver, uint256 _escrowedAmount, uint256 _nonEscrowedAmount);
/*
    constructor(
        string memory _name,
        string memory _symbol,
        address _depositToken,
        address _rewardToken,
        address _escrowPool,
        uint256 _escrowPortion,
        uint256 _escrowDuration
    ) ERC20Permit(_name) ERC20(_name, _symbol) AbstractRewards(balanceOf, totalSupply) {
        require(_escrowPortion <= 1e18, "BasePool.constructor: Cannot escrow more than 100%");
        require(_depositToken != address(0), "BasePool.constructor: Deposit token must be set");
        depositToken = IERC20(_depositToken);
        rewardToken = IERC20(_rewardToken);
        escrowPool = ITimeLockPool(_escrowPool);
        escrowPortion = _escrowPortion;
        escrowDuration = _escrowDuration;

        if(_rewardToken != address(0) && _escrowPool != address(0)) {
            IERC20(_rewardToken).safeApprove(_escrowPool, type(uint256).max);
        }
    }
*/
    function initializerBasePool(
        string memory _name,
        string memory _symbol,
        address _depositToken,
        address _rewardToken,
        address _escrowPool,
        uint256 _escrowPortion,
        uint256 _escrowDuration
    ) internal initializer {
        __ERC20Permit_init(_name);
        __ERC20_init(_name, _symbol);
        initializeAbstractRewards(balanceOf, totalSupply);
        require(_escrowPortion <= 1e18, "BasePool.constructor: Cannot escrow more than 100%");
        require(_depositToken != address(0), "BasePool.constructor: Deposit token must be set");
        depositToken = IERC20Upgradeable(_depositToken);
        rewardToken = IERC20Upgradeable(_rewardToken);
        escrowPool = ITimeLockPool(_escrowPool);
        escrowPortion = _escrowPortion;
        escrowDuration = _escrowDuration;

        if(_rewardToken != address(0) && _escrowPool != address(0)) {
            IERC20Upgradeable(_rewardToken).safeApprove(_escrowPool, type(uint256).max);
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