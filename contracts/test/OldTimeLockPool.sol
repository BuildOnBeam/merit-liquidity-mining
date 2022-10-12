// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import { IERC20Upgradeable as IERC20 } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { MathUpgradeable as Math } from "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import { SafeERC20Upgradeable as SafeERC20 } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import "../base/BasePool.sol";
import "../interfaces/ITimeLockPool.sol";

contract OldTimeLockPool is BasePool, ITimeLockPool {
    using Math for uint256;
    using SafeERC20 for IERC20;

    error SmallMaxLockDuration();
    error NonExistingDepositError();
    error TooSoonError();
    error MaxBonusError();

    uint256 public maxBonus;
    uint256 public maxLockDuration;
    uint256 public constant MIN_LOCK_DURATION = 10 minutes;
    
    uint256[] public curve;
    uint256 public unit;

    mapping(address => Deposit[]) public depositsOf;

    struct Deposit {
        uint256 amount;
        uint64 start;
        uint64 end;
    }
    function __TimeLockPool_init(
        string memory _name,
        string memory _symbol,
        address _depositToken,
        address _rewardToken,
        address _escrowPool,
        uint256 _escrowPortion,
        uint256 _escrowDuration,
        uint256 _maxBonus,
        uint256 _maxLockDuration,
        uint256[] memory _curve
    ) internal onlyInitializing {
        __BasePool_init(_name, _symbol, _depositToken, _rewardToken, _escrowPool, _escrowPortion, _escrowDuration);
        if (_maxLockDuration < MIN_LOCK_DURATION) {
            revert SmallMaxLockDuration();
        }
        if (_curve.length < 2) {
            revert ShortCurveError();
        }
        for (uint i=0; i < _curve.length; i++) {
            if (_curve[i] > _maxBonus) {
                revert MaxBonusError();
            }
            curve.push(_curve[i]);
        }
        maxBonus = _maxBonus;
        maxLockDuration = _maxLockDuration;
        unit = _maxLockDuration / (curve.length - 1);
    }

    error DepositExpiredError();
    error ZeroDurationError();
    error ZeroAmountError();
    error ShortCurveError();

    event Deposited(uint256 amount, uint256 duration, address indexed receiver, address indexed from);
    event Withdrawn(uint256 indexed depositId, address indexed receiver, address indexed from, uint256 amount);
    event LockExtended(uint256 indexed depositId, uint256 duration, address indexed from);
    event LockIncreased(uint256 indexed depositId, address indexed receiver, address indexed from, uint256 amount);
    event CurveChanged(address indexed sender);

    /**
     * @notice Creates a lock with an amount of tokens and mint the corresponding shares.
     * @dev The function forces the duration to be in between the minimum and maximum
     * duration if it the duration parameter is outside of those bounds. Uses the multiplier
     * function to get the amount of shares to mint.
     * @param _amount uint256 amount of tokens to be deposited
     * @param _duration uint256 time that the deposit will be locked.
     * @param _receiver uint256 owner of the lock
     */
    function deposit(uint256 _amount, uint256 _duration, address _receiver) external override {
        require(_amount > 0, "TimeLockPool.deposit: cannot deposit 0");
        // Don't allow locking > maxLockDuration
        uint256 duration = _duration.min(maxLockDuration);
        // Enforce min lockup duration to prevent flash loan or MEV transaction ordering
        duration = duration.max(MIN_LOCK_DURATION);

        depositToken.safeTransferFrom(_msgSender(), address(this), _amount);

        depositsOf[_receiver].push(Deposit({
            amount: _amount,
            start: uint64(block.timestamp),
            end: uint64(block.timestamp) + uint64(duration)
        }));

        uint256 mintAmount = _amount * getMultiplier(duration) / 1e18;

        _mint(_receiver, mintAmount);
        emit Deposited(_amount, duration, _receiver, _msgSender());
    }

    /**
     * @notice Withdraws all the tokens from the lock
     * @dev The lock has to be expired to withdraw the tokens. When the withdrawl happens
     * the shares minted on the deposit are burnt.
     * @param _depositId uint256 id of the deposit to be increased.
     * @param _receiver uint256 owner of the lock
     */
    function withdraw(uint256 _depositId, address _receiver) external {
        require(_depositId < depositsOf[_msgSender()].length, "TimeLockPool.withdraw: Deposit does not exist");
        Deposit memory userDeposit = depositsOf[_msgSender()][_depositId];
        require(block.timestamp >= userDeposit.end, "TimeLockPool.withdraw: too soon");

        //                      No risk of wrapping around on casting to uint256 since deposit end always > deposit start and types are 64 bits
        uint256 shareAmount = userDeposit.amount * getMultiplier(uint256(userDeposit.end - userDeposit.start)) / 1e18;

        // remove Deposit
        depositsOf[_msgSender()][_depositId] = depositsOf[_msgSender()][depositsOf[_msgSender()].length - 1];
        depositsOf[_msgSender()].pop();

        // burn pool shares
        _burn(_msgSender(), shareAmount);
        
        // return tokens
        depositToken.safeTransfer(_receiver, userDeposit.amount);
        emit Withdrawn(_depositId, _receiver, _msgSender(), userDeposit.amount);
    }

    /**
     * @notice Gets the multiplier from the curve given a duration.
     * @dev This function calculates a multiplier by fetching the points in the curve given a duration.
     * It can achieve this by linearly interpolating between the points of the curve to get a much more
     * precise result. The unit parameter is related to the maximum possible duration of the deposits 
     * and the amount of points in the curve.
     * @param _lockDuration uint256 time that the deposit will be locked.
     * @return uint256 number used to multiply and get amount of shares.
     */
    function getMultiplier(uint256 _lockDuration) public view returns(uint256) {
        return 1e18 + (maxBonus * _lockDuration / maxLockDuration);
    }

    function getTotalDeposit(address _account) public view returns(uint256) {
        uint256 total;
        for(uint256 i = 0; i < depositsOf[_account].length; i++) {
            total += depositsOf[_account][i].amount;
        }

        return total;
    }

    function getDepositsOf(address _account) public view returns(Deposit[] memory) {
        return depositsOf[_account];
    }

    function getDepositsOfLength(address _account) public view returns(uint256) {
        return depositsOf[_account].length;
    }
}