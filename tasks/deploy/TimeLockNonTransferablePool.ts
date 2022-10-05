import { parseEther } from "ethers/lib/utils";
import { task } from "hardhat/config";
import { TimeLockNonTransferablePool__factory } from "../../typechain";
import sleep from "../../utils/sleep";

const VERIFY_DELAY = 100000;

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
    .addParam("curve", "Points in the curve used to get the multiplier bonus")
    .addFlag("verify")
    .setAction(async(taskArgs, { ethers, run }) => {
        const signers = await ethers.getSigners();

        console.log("Deploying TimeLockNonTransferablePool");
        const timeLockNonTransferablePool = await (new TimeLockNonTransferablePool__factory(signers[0]).deploy(
            taskArgs.name,
            taskArgs.symbol,
            taskArgs.depositToken,
            taskArgs.rewardToken,
            taskArgs.escrowPool,
            parseEther(taskArgs.escrowPortion),
            taskArgs.escrowDuration,
            parseEther(taskArgs.maxBonus),
            taskArgs.maxLockDuration,
            taskArgs.curve
        ));
        console.log(`TimeLockNonTransferablePool deployed at: ${timeLockNonTransferablePool.address}`);

        if(taskArgs.verify) {
            console.log("Verifying TimeLockNonTransferablePool, can take some time")
            await sleep(VERIFY_DELAY);
            await run("verify:verify", {
                address: timeLockNonTransferablePool.address,
                constructorArguments: [
                    taskArgs.name,
                    taskArgs.symbol,
                    taskArgs.depositToken,
                    taskArgs.rewardToken,
                    taskArgs.escrowPool,
                    parseEther(taskArgs.escrowPortion),
                    taskArgs.escrowDuration,
                    parseEther(taskArgs.maxBonus),
                    taskArgs.maxLockDuration,
                    taskArgs.curve
                ]
            });
        }
        console.log("done");

        return timeLockNonTransferablePool;
});