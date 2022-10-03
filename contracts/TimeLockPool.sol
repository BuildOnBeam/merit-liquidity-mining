// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./base/BasePool.sol";
import "./interfaces/ITimeLockPool.sol";

import "hardhat/console.sol";

contract TimeLockPool is BasePool, ITimeLockPool {
    using Math for uint256;
    using SafeERC20 for IERC20;

    uint256 public immutable maxBonus;
    uint256 public immutable maxLockDuration;
    uint256 public constant MIN_LOCK_DURATION = 10 minutes;
    
    uint256[] public curve;
    uint256 public unit;

    mapping(address => Deposit[]) public depositsOf;

    struct Deposit {
        uint256 amount;
        uint256 shareAmount;
        uint64 start;
        uint64 end;
    }
    constructor(
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
    ) BasePool(_name, _symbol, _depositToken, _rewardToken, _escrowPool, _escrowPortion, _escrowDuration) {
        require(_maxLockDuration >= MIN_LOCK_DURATION, "TimeLockPool.constructor: max lock duration must be greater or equal to mininmum lock duration");
        maxBonus = _maxBonus;
        maxLockDuration = _maxLockDuration;
        if (_curve.length < 2) {
            revert ShortCurveError();
        }
        curve = _curve;
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

    function deposit(uint256 _amount, uint256 _duration, address _receiver) external override {
        require(_amount > 0, "TimeLockPool.deposit: cannot deposit 0");
        // Don't allow locking > maxLockDuration
        uint256 duration = _duration.min(maxLockDuration);
        // Enforce min lockup duration to prevent flash loan or MEV transaction ordering
        duration = duration.max(MIN_LOCK_DURATION);

        depositToken.safeTransferFrom(_msgSender(), address(this), _amount);

        uint256 mintAmount = _amount * getMultiplier(duration) / 1e18;

        depositsOf[_receiver].push(Deposit({
            amount: _amount,
            shareAmount: mintAmount,
            start: uint64(block.timestamp),
            end: uint64(block.timestamp) + uint64(duration)
        }));

        _mint(_receiver, mintAmount);
        emit Deposited(_amount, duration, _receiver, _msgSender());
    }

    function withdraw(uint256 _depositId, address _receiver) external {
        require(_depositId < depositsOf[_msgSender()].length, "TimeLockPool.withdraw: Deposit does not exist");
        Deposit memory userDeposit = depositsOf[_msgSender()][_depositId];
        require(block.timestamp >= userDeposit.end, "TimeLockPool.withdraw: too soon");

        // remove Deposit
        depositsOf[_msgSender()][_depositId] = depositsOf[_msgSender()][depositsOf[_msgSender()].length - 1];
        depositsOf[_msgSender()].pop();

        // burn pool shares
        _burn(_msgSender(), userDeposit.shareAmount);
        
        // return tokens
        depositToken.safeTransfer(_receiver, userDeposit.amount);
        emit Withdrawn(_depositId, _receiver, _msgSender(), userDeposit.amount);
    }

    /**
     * @notice Adds more time to current lock.
     * @dev This function extends the duration of a specific lock -deposit- of the sender.
     * While doing so, it uses the timestamp of the current block and calculates the remaining
     * time to the end of the lock, and adds the increase duration. This results is a new
     * duration that can be different to the original duration from the lock one (>, = or <), 
     * and gets multiplied by the correspondant multiplier. The final result can be more, same,
     * or less shares, which will be minted/burned accordingly.
     */
    function extendLock(uint256 _depositId, uint256 _increaseDuration) external {
        // Check if actually increasing
        if (_increaseDuration == 0) {
            revert ZeroDurationError();
        }

        Deposit memory userDeposit = depositsOf[_msgSender()][_depositId];

        // Only can extend if it has not expired
        if (block.timestamp >= userDeposit.end) {
            revert DepositExpiredError();
        }
        
        // Enforce min increase to prevent flash loan or MEV transaction ordering
        uint256 increaseDuration = _increaseDuration.max(MIN_LOCK_DURATION);
        
        // New duration is the time expiration plus the increase
        uint256 duration = maxLockDuration.min(uint256(userDeposit.end - block.timestamp) + increaseDuration);

        uint256 mintAmount = userDeposit.amount * getMultiplier(duration) / 1e18;

        // Multiplier curve changes with time, need to check if the mint amount is bigger, equal or smaller than the already minted
        
        // If the new amount if bigger mint the difference
        if (mintAmount > userDeposit.shareAmount) {
            depositsOf[_msgSender()][_depositId].shareAmount =  mintAmount;
            _mint(_msgSender(), mintAmount - userDeposit.shareAmount);
        // If the new amount is less then burn that difference
        } else if (mintAmount < userDeposit.shareAmount) {
            depositsOf[_msgSender()][_depositId].shareAmount =  mintAmount;
            _burn(_msgSender(), userDeposit.shareAmount - mintAmount);
        }

        depositsOf[_msgSender()][_depositId].start = uint64(block.timestamp);
        depositsOf[_msgSender()][_depositId].end = uint64(block.timestamp) + uint64(duration);
        emit LockExtended(_depositId, _increaseDuration, _msgSender());
    }

    /**
     * @notice Adds more deposits to current lock.
     * @dev This function increases the deposit amount of a specific lock -deposit- of the sender.
     * While doing so, it uses the timestamp of the current block and calculates the remaining
     * time to the end of the lock. Then it uses this time duration to mint the shares that correspond
     * to the multiplier of that time and the increase amount being deposited. The result is an increase
     * both in deposit amount and share amount of the deposit.
     */
    function increaseLock(uint256 _depositId, address _receiver, uint256 _increaseAmount) external {
        // Check if actually increasing
        if (_increaseAmount == 0) {
            revert ZeroAmountError();
        }

        Deposit memory userDeposit = depositsOf[_msgSender()][_depositId];

        // Only can extend if it has not expired
        if (block.timestamp >= userDeposit.end) {
            revert DepositExpiredError();
        }

        depositToken.safeTransferFrom(_msgSender(), address(this), _increaseAmount);

        // Multiplier should be acording the remaining time to the deposit to end
        uint256 remainingDuration = uint256(userDeposit.end - block.timestamp);

        uint256 mintAmount = _increaseAmount * getMultiplier(remainingDuration) / 1e18;

        depositsOf[_receiver][_depositId].amount += _increaseAmount;
        depositsOf[_receiver][_depositId].shareAmount += mintAmount;

        _mint(_receiver, mintAmount);
        emit LockIncreased(_depositId, _receiver, _msgSender(), _increaseAmount);
    }

    /**
     * @notice Gets the multiplier from the curve given a duration.
     * @dev This function calculates a multiplier by fetching the points in the curve given a duration.
     * It can achieve this by linearly interpolating between the points of the curve to get a much more
     * precise result. The unit parameter is related to the maximum possible duration of the deposits 
     * and the amount of points in the curve.
     */
    function getMultiplier(uint256 _lockDuration) public view returns(uint256) {
        // There is no need to check _lockDuration amount, it is always checked before
        // in the functions that call this function

        // n is the time unit where the lockDuration stands
        uint n = _lockDuration / unit;
        // if last point no need to interpolate
        // trim de curve if it exceedes the maxBonus // TODO check if this is needed
        if (n == curve.length - 1) {
            return 1e18 + maxBonus.min(curve[n]);
        }
        // linear interpolation between points
        return 1e18 + maxBonus.min(curve[n] + (_lockDuration - n * unit) * (curve[n + 1] - curve[n]) / unit);
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

    /**
     * @notice Can set an entire new curve.
     * @dev This function can change current curve by a completely new. For doing so, it does not
     * matter if the new curve's length is larger, equal, or shorter because the function manages
     * all of those cases.
     */
    function setCurve(uint256[] calldata _curve) external onlyGov {
        if (_curve.length < 2) {
            revert ShortCurveError();
        }
        // same length curves
        if (curve.length == _curve.length) {
            for (uint i=0; i < curve.length; i++) {
                curve[i] = _curve[i];
            }
        // replacing with a shorter curve
        } else if (curve.length > _curve.length) {
            for (uint i=0; i < _curve.length; i++) {
                curve[i] = _curve[i];
            }
            uint initialLength = curve.length;
            for (uint j=0; j < initialLength - _curve.length; j++) {
                curve.pop();
            }
            unit = maxLockDuration / (curve.length - 1);
        // replacing with a longer curve
        } else {
            for (uint i=0; i < curve.length; i++) {
                curve[i] = _curve[i];
            }
            uint initialLength = curve.length;
            for (uint j=0; j < _curve.length - initialLength; j++) {
                curve.push(_curve[initialLength + j]);
            }
            unit = maxLockDuration / (curve.length - 1);
        }
        emit CurveChanged(_msgSender());
    }

    /**
     * @notice Can set a point of the curve.
     * @dev This function can replace any point in the curve by inputing the existing index,
     * add a point to the curve by using the index that equals the amount of points of the curve,
     * and remove the last point of the curve if an index greated than the length is used. The first
     * point of the curve index is zero.
     */
    function setCurvePoint(uint256 _newPoint, uint256 _position) external onlyGov {
        if (_position < curve.length) {
            curve[_position] = _newPoint;
        } else if (_position == curve.length) {
            curve.push(_newPoint);
        } else {
            if (curve.length - 1 < 2) {
                revert ShortCurveError();
            }
            curve.pop();
        }
        emit CurveChanged(_msgSender());
    }
}