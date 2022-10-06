import { parseEther } from "ethers/lib/utils";
import { task } from "hardhat/config";
import { TransparentUpgradeableProxy__factory } from "../../typechain";
import sleep from "../../utils/sleep";

const VERIFY_DELAY = 100000;

task("deploy-proxy")
    .addParam("name", "Name of the staking pool")
    .addParam("symbol", "Symbol of the staking pool")
    .addParam("depositToken", "Token which users deposit")
    .addParam("rewardToken", "Token users will receive as reward")
    .addParam("escrowPool", "Pool used to escrow rewards")
    .addParam("escrowPortion", "Portion being escrowed, 1 == 100%")
    .addParam("escrowDuration", "How long tokens will be escrowed")
    .addParam("maxBonus", "Maximum bonus a user can get")
    .addParam("maxLockDuration", "After how long the bonus is maxed out, in seconds")
    .addParam("curve", "Points in the curve used to get the multiplier bonus")
    .addParam("proxyAdmin", "Address of the proxy admin")
    .addParam("implementation", "Deployed instance of the implementation")
    .addFlag("verify")
    .setAction(async(taskArgs, { ethers, run }) => {
        const signers = await ethers.getSigners();

        const iface = new ethers.utils.Interface(JSON.stringify(taskArgs.implementation.interface));
        const initializeParameters = [
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
        const encoded_data = iface.encodeFunctionData("initialize", initializeParameters);
        const Proxy = new TransparentUpgradeableProxy__factory(signers[0]);
        console.log("Deploying Proxy");
        const proxy = await Proxy.deploy(taskArgs.implementation.address, taskArgs.proxyAdmin.address, encoded_data);
        console.log(`Proxy deployed at: ${proxy.address}`);
        const proxyImplementation = new ethers.Contract(proxy.address, JSON.stringify(taskArgs.implementation.interface), signers[0]);

        if(taskArgs.verify) {
            console.log("Verifying Proxy, can take some time")
            await sleep(VERIFY_DELAY);
            await run("verify:verify", {
                address: proxy.address,
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
                    taskArgs.curve,
                    taskArgs.proxyAdmin,
                    taskArgs.implementation
                ]
            });
        }
        console.log("done");

        return [proxy, proxyImplementation];
});