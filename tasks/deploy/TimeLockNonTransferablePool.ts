import { parseEther } from "ethers/lib/utils";
import { task } from "hardhat/config";
import { TimeLockNonTransferablePool__factory } from "../../typechain";
import sleep from "../../utils/sleep";

const VERIFY_DELAY = 100000;

// constructor(
//     string memory _name,
//     string memory _symbol,
//     address _depositToken,
//     address _rewardToken,
//     address _escrowPool,
//     uint256 _escrowPortion,
//     uint256 _escrowDuration,
//     uint256 _maxBonus,
//     uint256 _maxLockDuration
// ) TimeLockPool(_name, _symbol, _depositToken, _rewardToken, _escrowPool, _escrowPortion, _escrowDuration, _maxBonus, _maxLockDuration)

task("deploy-time-lock-non-transferable-pool")
    .addParam("name", "Name of the staking pool")
    .addParam("symbol", "Symbol of the staking pool")
    .addParam("depositToken", "Token which users deposit")
    .addParam("rewardToken", "Token users will receive as reward")
    .addParam("escrowPool", "Pool used to escrow rewards")
    .addParam("escrowPortion", "Portion being escrowed, 1 == 100%")
    .addParam("escrowDuration", "How long tokens will be escrowed")
    .addParam("maxBonus", "Maximum bonus for locking longer, 1 == 100% bonus")
    .addParam("maxLockDuration", "After how long the bonus is maxed out, in seconds")
    .setAction(async(taskArgs, { ethers, run }) => {
        const signers = ethers.getSigners();

        const timeLockNonTransferablePool = await (new TimeLockNonTransferablePool__factory(signers[0]).deploy(
            taskArgs.name,
            taskArgs.symbol,
            taskArgs.depositToken,
            taskArgs.rewardToken,
            taskArgs.rewardPool,
            parseEther(taskArgs.escrowPortion),
            taskArgs.escrowDuration,
            parseEther(taskArgs.maxBonus),
            taskArgs.maxLockDuration
        ));

});