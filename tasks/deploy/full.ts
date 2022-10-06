import { task } from "hardhat/config";
import {
    TimeLockNonTransferablePool,
    ProxyAdmin,
    TransparentUpgradeableProxy,
    View 
} from "../../typechain";
import sleep from "../../utils/sleep";
import { constants, utils } from "ethers";
import { captureRejectionSymbol } from "events";

const MC = "0x949d48eca67b17269629c7194f4b727d4ef9e5d6";
const LP = "0xcCb63225a7B19dcF66717e4d40C9A72B39331d61";
const eMC = "0xfeea44bc2161f2fe11d55e557ae4ec855e2d1168";
const multisig = "0x7e9e4c0876b2102f33a1d82117cc73b7fddd0032";
const ONE_YEAR = 60 * 60 * 24 * 365;
const FOUR_YEARS = ONE_YEAR * 4;

task("deploy-liquidity-mining")
    .addFlag("verify")
    .setAction(async(taskArgs, { run, ethers }) => {
    const signers = await ethers.getSigners();



    // Deployment of the first proxy admin, pool implementation and proxy contract
    const mcPoolProxyAdmin: ProxyAdmin = await run("deploy-proxy-admin", {
        verify: taskArgs.verify
    });
    await mcPoolProxyAdmin.deployed();

    const mcPoolImplementation: TimeLockNonTransferablePool = await run("deploy-time-lock-non-transferable-pool-implementation", {
        verify: taskArgs.verify
    });
    await mcPoolImplementation.deployed();
    
    // Returns the same contract with two different interfaces: proxy and proxy implementation (interface of the pool)
    const [mcProxy, mcProxyImplementation]: [TransparentUpgradeableProxy, TimeLockNonTransferablePool] = await run("deploy-proxy", {
        name: "Staked Merit Circle",
        symbol: "SMC",
        depositToken: MC, // users stake MC tokens
        rewardToken: MC, // rewards is MC token
        escrowPool: eMC, // Rewards are locked in the escrow pool
        escrowPortion: "1", // 100% is locked
        escrowDuration: ONE_YEAR.toString(), // locked for 1 year
        maxBonus: "5", // Bonus for longer locking is 1. When locking for longest duration you'll receive 2x vs no lock limit
        maxLockDuration: FOUR_YEARS.toString(), // Users can lock up to 1 year
        proxyAdmin: mcPoolProxyAdmin.address,
        implementation: mcPoolImplementation, // Interface of the implementation
        verify: taskArgs.verify
    });
    await mcProxy.deployed()






    // Deployment of the second proxy admin, pool implementation and proxy contract
    const mcLPPoolProxyAdmin: ProxyAdmin = await run("deploy-proxy-admin", {
        verify: taskArgs.verify
    });
    await mcLPPoolProxyAdmin.deployed();

    const mcLPPoolImplementation: TimeLockNonTransferablePool = await run("deploy-time-lock-non-transferable-pool-implementation", {
        verify: taskArgs.verify
    });
    await mcLPPoolImplementation.deployed();

    // Returns the same contract with two different interfaces: proxy and proxy implementation (interface of the pool)
    const [mcLPProxy, mcLPProxyImplementation]: [TransparentUpgradeableProxy, TimeLockNonTransferablePool] = await run("deploy-proxy", {
        name: "Staked Merit Circle",
        symbol: "SMC",
        depositToken: MC, // users stake MC tokens
        rewardToken: MC, // rewards is MC token
        escrowPool: eMC, // Rewards are locked in the escrow pool
        escrowPortion: "1", // 100% is locked
        escrowDuration: ONE_YEAR.toString(), // locked for 1 year
        maxBonus: "5", // Bonus for longer locking is 1. When locking for longest duration you'll receive 2x vs no lock limit
        maxLockDuration: FOUR_YEARS.toString(), // Users can lock up to 1 year
        proxyAdmin: mcLPPoolProxyAdmin.address,
        implementation: mcLPPoolImplementation, // Interface of the implementation
        verify: taskArgs.verify
    });
    await mcLPProxy.deployed()
    


    // Deployment of the view contract
    const view:View = await run("deploy-view", {
        verify: taskArgs.verify
    });


    
    const GOV_ROLE = await mcProxyImplementation.GOV_ROLE();
    const DEFAULT_ADMIN_ROLE = await mcProxyImplementation.GOV_ROLE();
    //const GOV_ROLE = await mcLPProxyImplementation.GOV_ROLE();
    //const DEFAULT_ADMIN_ROLE = await mcLPProxyImplementation.GOV_ROLE();
    
    // Assign GOV_ROLE to deployer
    (await (await mcProxyImplementation.grantRole(GOV_ROLE, signers[0].address)).wait(3));
    (await (await mcLPProxyImplementation.grantRole(GOV_ROLE, signers[0].address)).wait(3));

    // Assign GOV_ROLE and DEFAULT_ADMIN_ROLE to multisig
    (await (await mcProxyImplementation.grantRole(GOV_ROLE, multisig)).wait(3));
    (await (await mcProxyImplementation.grantRole(DEFAULT_ADMIN_ROLE, multisig)).wait(3));
    (await (await mcLPProxyImplementation.grantRole(GOV_ROLE, multisig)).wait(3));
    (await (await mcLPProxyImplementation.grantRole(DEFAULT_ADMIN_ROLE, multisig)).wait(3));



    console.log("DONE");

    console.table({
        mcPoolProxyAdmin: mcPoolProxyAdmin.address,
        mcPoolImplementation: mcPoolImplementation.address,
        mcProxy: mcProxy.address,
        mcLPPoolProxyAdmin: mcLPPoolProxyAdmin.address,
        mcLPPoolImplementation: mcLPPoolImplementation.address,
        mcLPProxy: mcLPProxy.address,
        view: view.address
    });

    //console.log("CHECK IF EVERYTHING IS CORRECTLY SETUP AND THEN RENOUNCE THE DEFAULT_ADMIN_ROLE and pools ON THE liquidityMiningManager CONTRACT FROM THE DEPLOYER ADDRESS");
    console.log("❤⭕");
});