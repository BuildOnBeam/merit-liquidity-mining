import { parseEther } from "ethers/lib/utils";
import { task } from "hardhat/config";
import { TimeLockNonTransferablePool__factory } from "../../typechain";
import sleep from "../../utils/sleep";

const VERIFY_DELAY = 100000;

task("deploy-time-lock-non-transferable-pool")
    .addFlag("verify")
    .setAction(async(taskArgs, { ethers, run }) => {
        const signers = await ethers.getSigners();

        console.log("Deploying TimeLockNonTransferablePool");
        const timeLockNonTransferablePool = await (new TimeLockNonTransferablePool__factory(signers[0]).deploy());
        console.log(`TimeLockNonTransferablePool deployed at: ${timeLockNonTransferablePool.address}`);

        if(taskArgs.verify) {
            console.log("Verifying TimeLockNonTransferablePool, can take some time")
            await sleep(VERIFY_DELAY);
            await run("verify:verify", {
                address: timeLockNonTransferablePool.address,
                constructorArguments: []
            });
        }
        console.log("done");

        return timeLockNonTransferablePool;
});