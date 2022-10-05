import { task } from "hardhat/config";
import { TokenSaver__factory } from "../../typechain";
import sleep from "../../utils/sleep";
const VERIFY_DELAY = 100000;

task("deploy-token-saver")
    .setAction(async(taskArgs, { ethers, run }) => {
        const signers = await ethers.getSigners();
        console.log("deploying TokenSaver");
        const tokenSaver = await (new TokenSaver__factory(signers[0])).deploy();
        console.log(`TokenSaver deployed at: ${tokenSaver.address}`);

        if(taskArgs.verify) {
            console.log("Verifying TokenSaver token, can take some time")
            await tokenSaver.deployed();
            await sleep(VERIFY_DELAY);
            await run("verify:verify", {
                address: tokenSaver.address,    
                constructorArguments: []
            })
        }
});
