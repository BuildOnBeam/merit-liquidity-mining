import { task } from "hardhat/config";

import { LiquidityMiningManager__factory } from "../../typechain";
import sleep from "../../utils/sleep";

const VERIFY_DELAY = 100000;

task("deploy-liquidity-mining-manager")
    .addParam("rewardToken", "Address of token used as reward")
    .addParam("rewardSource", "Address where the tokens are send from, this address needs to set an approval")
    .addFlag("verify")
    .setAction(async(taskArgs, { ethers, run }) => {
        const signers = await ethers.getSigners();

        console.log("Deploying LiquidityMiningManager");
        const liquidityMiningManager = await (new LiquidityMiningManager__factory(signers[0]).deploy(taskArgs.rewardToken, taskArgs.rewardSource));
        console.log(`liquidityMiningManager deployed at: ${liquidityMiningManager.address}`);

        if(taskArgs.verify) {
            console.log("Verifying liquidityMiningManager, can take some time")
            await sleep(VERIFY_DELAY);
            await run("verify:verify", {
                address: liquidityMiningManager.address,
                constructorArguments: [
                    taskArgs.rewardToken,
                    taskArgs.rewardSource
                ]
            });
        }
        return liquidityMiningManager;
})