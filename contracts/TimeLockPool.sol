// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./base/BasePool.sol";

contract TimeLockPool is BasePool {
    // TODO implement reward tracking

    using Math for uint256;
    using SafeERC20 for IERC20;

    uint256 public immutable maxBonus;
    uint256 public immutable maxLockDuration;
    
    mapping(address => Deposit[]) public depositsOf;

    struct Deposit {
        uint256 amount;
        uint64 start;
        uint64 end;
    }
    constructor(
        string memory _name,
        string memory _symbol,
        address _depositToken,
        address _rewardToken,
        uint256 _maxBonus,
        uint256 _maxLockDuration
    ) BasePool(_name, _symbol, _depositToken, _rewardToken) {
        maxBonus = _maxBonus;
        maxLockDuration = _maxLockDuration;
    }

    function deposit(uint256 _amount, uint256 _duration, address _receiver) external {
        // Don't allow locking > maxLockDuration
        uint256 duration = _duration.min(maxLockDuration);
        depositToken.safeTransferFrom(_msgSender(), address(this), _amount);

        depositsOf[_receiver].push(Deposit({
            amount: _amount,
            start: uint64(duration),
            end: uint64(block.timestamp) + uint64(duration)
        }));

        uint256 mintAmount = _amount * getMultiplier(duration) / 1e18;

        _mint(_receiver, mintAmount);
    }

    function withdraw(uint256 _depositId, address _receiver) external {
        Deposit memory userDeposit = depositsOf[_msgSender()][_depositId];
        uint256 tokenAmount = userDeposit.amount * 1e18 / getMultiplier(userDeposit.end - userDeposit.start);

        // remove Deposit
        depositsOf[_msgSender()][_depositId] = depositsOf[_msgSender()][depositsOf[_msgSender()].length - 1];
        depositsOf[_msgSender()].pop();
        
        // return tokens
        depositToken.safeTransfer(_receiver, tokenAmount);
    }


    function claimRewards(address _receiver) external {
        // TODO implement
        // Consider making abstract so we can have escrowed and non escrowed variants
    }

    function getMultiplier(uint256 _lockDuration) public view returns(uint256) {
        return 1e18 + (maxBonus * _lockDuration / maxLockDuration);
    }
}