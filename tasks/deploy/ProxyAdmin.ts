import { parseEther } from "ethers/lib/utils";
import { task } from "hardhat/config";
import { ProxyAdmin__factory } from "../../typechain";
import sleep from "../../utils/sleep";

const VERIFY_DELAY = 100000;

task("deploy-proxy-admin")
    .addFlag("verify")
    .setAction(async(taskArgs, { ethers, run }) => {
        const signers = await ethers.getSigners();

        console.log("Deploying ProxyAdmin");
        const proxyAdmin = await (new ProxyAdmin__factory(signers[0]).deploy());
        console.log(`ProxyAdmin deployed at: ${proxyAdmin.address}`);

        if(taskArgs.verify) {
            console.log("Verifying ProxyAdmin, can take some time")
            await sleep(VERIFY_DELAY);
            await run("verify:verify", {
                address: proxyAdmin.address,
                constructorArguments: []
            });
        }
        console.log("done");

        return proxyAdmin;
});