import { task } from "hardhat/config";
import { View__factory } from "../../typechain";
import sleep from "../../utils/sleep";

const VERIFY_DELAY = 100000;

task("deploy-view")
    .addFlag("verify")
    .setAction(async(taskArgs, { ethers, run }) => {
        const signers = await ethers.getSigners();

        console.log("Deploying View");
        const view = await (new View__factory(signers[0])).deploy();
        console.log(`View deployed at: ${view.address}`);

        if(taskArgs.verify) {
            console.log("Verifying View, can take some time")
            await sleep(VERIFY_DELAY);
            await run("verify:verify", {
                address: view.address,
                constructorArguments: []
            });
        }

        console.log("Done");

        return view;
});