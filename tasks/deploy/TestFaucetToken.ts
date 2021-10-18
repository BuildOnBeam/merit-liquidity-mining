import { task } from "hardhat/config";
import { TestFaucetToken__factory } from "../../typechain";
import sleep from "../../utils/sleep";

const VERIFY_DELAY = 100000;

task("deploy-test-faucet-token")
    .addParam("name")
    .addParam("symbol")
    .addFlag("verify")
    .setAction(async(taskArgs, { ethers, run }) => {
        const signers = await ethers.getSigners();

        console.log("Deploying TestFaucetToken");
        const testFaucetToken = await (new TestFaucetToken__factory(signers[0])).deploy(taskArgs.name, taskArgs.symbol);
        console.log(`TestFaucetToken deployed at ${testFaucetToken.address}`);

        if(taskArgs.verify) {
            console.log("Verifying TestFaucetToken, can take some time")
            await sleep(VERIFY_DELAY);
            await run("verify:verify", {
                address: testFaucetToken.address,
                constructorArguments: [
                    taskArgs.name,
                    taskArgs.symbol
                ]
            });
        }
        console.log("done");
});