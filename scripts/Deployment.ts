import { Contract } from "ethers";
import { parseEther } from "@ethersproject/units";
import {
    ProxyAdmin,
    ProxyAdmin__factory,
    TimeLockNonTransferablePool,
    TimeLockNonTransferablePool__factory,
    TransparentUpgradeableProxy,
    TransparentUpgradeableProxy__factory
} from "../typechain";
import hre, { ethers } from "hardhat";
import * as TimeLockNonTransferablePoolJSON from "../artifacts/contracts/TimeLockNonTransferablePool.sol/TimeLockNonTransferablePool.json";

// Console input
import {createInterface} from "readline";

const rl = createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (questionText: string) =>
    new Promise<string>(resolve => rl.question(questionText, resolve))
        .finally(() => rl.close());



///////////////////////////////////////////////////////////////////////////////////////////////////////
// Parameters /////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////
// Duration used for Escrowed Merit Circle
const ESCROW_DURATION = 60 * 60 * 24 * 365;

// Portion of the funds that escrow (1 = 100%)
const ESCROW_PORTION = parseEther("1");

// Security meassure that limits the setting of curve points
const MAX_BONUS = parseEther("5");

// Maximum duration that a lock can have
const MAX_LOCK_DURATION = 60 * 60 * 24 * 365 * 4;

// Curve used for the non escrow pools
const CURVE = [
    parseEther("0"),
    parseEther("0.65"),
    parseEther("1.5"),
    parseEther("3"),
    parseEther("5")
]

// MAINNET ////////////////////////////////////////////////////////////////////////
// 0x7e9e4c0876B2102F33A1d82117Cc73B7FddD0032 | Merit Circle Multisig
const MAINNET_MULTISIG = "0x7e9e4c0876B2102F33A1d82117Cc73B7FddD0032";
// 0x949D48EcA67b17269629c7194F4b727d4Ef9E5d6 | Merit Circle (MC)
const MAINNET_MC_TOKEN = "0x949D48EcA67b17269629c7194F4b727d4Ef9E5d6";
// 0xcCb63225a7B19dcF66717e4d40C9A72B39331d61 | MC/ETH Uni V2 LP (MCETHLP)
const MAINNET_MCETHLP_TOKEN = "0xcCb63225a7B19dcF66717e4d40C9A72B39331d61";
// 0xfEEA44bc2161F2Fe11D55E557ae4Ec855e2D1168 | Escrowed Merit Circle (eMC)
const MAINNET_ESCROW_POOL = "0xfEEA44bc2161F2Fe11D55E557ae4Ec855e2D1168";

// 0x5c76aD4764A4607cD57644faA937A8cA16729e39 | Staked MC pool (sMC)
// 0x44c01e5e4216f3162538914d9c7f5E6A0d87820e | Staked MC LP (sMCETHLP)
///////////////////////////////////////////////////////////////////////////////////


// LOCALHOST //////////////////////////////////////////////////////////////////////
// 0x7e9e4c0876B2102F33A1d82117Cc73B7FddD0032 | Merit Circle Multisig
const LOCALHOST_MULTISIG = "0x7e9e4c0876B2102F33A1d82117Cc73B7FddD0032";
// 0xF5aA8e3C6BA1EdF766E197a0bCD5844Fd1ed8A27 | Merit Circle (MC)
const LOCALHOST_MC_TOKEN = "0xF5aA8e3C6BA1EdF766E197a0bCD5844Fd1ed8A27";
// 0xee85d401835561De62b874147Eca8A4Fe1D5cBFf | MC/ETH Uni V2 LP (MCETHLP)
const LOCALHOST_MCETHLP_TOKEN = "0xee85d401835561De62b874147Eca8A4Fe1D5cBFf";
// 0xd9F9304329451Dd31908BC61C0F87e2AA90aacD6 | Escrowed Merit Circle (eMC)
const LOCALHOST_ESCROW_POOL = "0xd9F9304329451Dd31908BC61C0F87e2AA90aacD6";
///////////////////////////////////////////////////////////////////////////////////



let MC_TOKEN: string;
let MCETHLP_TOKEN: string;
let ESCROW_POOL: string;
let MULTISIG: string;

async function deployUpgradeable() {
    const signers = await ethers.getSigners();

    const chainChoosing = await question("Type 1 for Localhost or 2 for Mainnet: ");

    if (chainChoosing == "1") {
        // MAINNET ////////////////////////////////////////////////////////////////////////
        MULTISIG = LOCALHOST_MULTISIG;
        MC_TOKEN = LOCALHOST_MC_TOKEN;
        MCETHLP_TOKEN = LOCALHOST_MCETHLP_TOKEN;
        ESCROW_POOL = LOCALHOST_ESCROW_POOL;
    } else if (chainChoosing == "2") {
        // LOCALHOST //////////////////////////////////////////////////////////////////////
        MULTISIG = MAINNET_MULTISIG;
        MC_TOKEN = MAINNET_MC_TOKEN;
        MCETHLP_TOKEN = MAINNET_MCETHLP_TOKEN;
        ESCROW_POOL = MAINNET_ESCROW_POOL;
    } else {
        console.log("Choose a different chain.");
        return false;
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Deployment of MC Pool //////////////////////////////////////////////////////////////////////////////
    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    let mcPoolProxyAdmin: ProxyAdmin;
    let mcPoolImplementation: TimeLockNonTransferablePool;
    let mcPoolProxyDeploy: TransparentUpgradeableProxy;
    let mcPoolProxy: Contract;

    console.log("MC POOL DEPLOYMENT:");
    // Deploy MCPool ProxyAdmin
    console.log("  Deploying MC Pool ProxyAdmin");
    const MCProxyAdmin = new ProxyAdmin__factory(signers[0]);
    mcPoolProxyAdmin = (await MCProxyAdmin.deploy());
    await mcPoolProxyAdmin.deployed();
    console.log(`  MC Pool ProxyAdmin deployed to ${mcPoolProxyAdmin.address}`,'\n');


    // First deploy implementations: TimeLockNonTransferablePool
    console.log("  Deploying MC Pool Implementation");
    const MCPoolFactory = new TimeLockNonTransferablePool__factory(signers[0]);
    mcPoolImplementation = await MCPoolFactory.deploy();
    await mcPoolImplementation.deployed();
    console.log(`  MC Pool Implementation deployed to ${mcPoolImplementation.address}`,'\n');

    const MCPoolInitializeParams = [
        "Staked Merit Circle V2",
        "sMCV2",
        MC_TOKEN,
        MC_TOKEN,
        ESCROW_POOL,
        ESCROW_PORTION,
        ESCROW_DURATION,
        MAX_BONUS,
        MAX_LOCK_DURATION,
        CURVE
    ]

    const MCPoolImplementationInterface = new hre.ethers.utils.Interface(JSON.stringify(TimeLockNonTransferablePoolJSON.abi))
    const MCPool_encoded_data = MCPoolImplementationInterface.encodeFunctionData("initialize", MCPoolInitializeParams);

    // Deploy the proxy and initialize with specific pool parameters
    console.log("  Deploying MC Pool Proxy");
    const MCPoolProxyDeploy = new TransparentUpgradeableProxy__factory(signers[0]);
    mcPoolProxyDeploy = await MCPoolProxyDeploy.deploy(
        mcPoolImplementation.address,
        mcPoolProxyAdmin.address,
        MCPool_encoded_data
    );
    await mcPoolProxyDeploy.deployed();
    console.log(`  MC Pool Proxy deployed to ${mcPoolProxyDeploy.address}`,'\n\n');
    mcPoolProxy = new ethers.Contract(mcPoolProxyDeploy.address, MCPoolImplementationInterface, signers[0]);





    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Deployment of MCETHLP Pool /////////////////////////////////////////////////////////////////////////
    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    let mcethlpPoolProxyAdmin: ProxyAdmin;
    let mcethlpPoolImplementation: TimeLockNonTransferablePool;
    let mcethlpPoolProxyDeploy: TransparentUpgradeableProxy;
    let mcethlpPoolProxy: Contract;

    console.log("MCETHLP POOL DEPLOYMENT:");
    // Deploy MCPool ProxyAdmin
    console.log("  Deploying MCETHLP Pool ProxyAdmin");
    const MCETHLPProxyAdmin = new ProxyAdmin__factory(signers[0]);
    mcethlpPoolProxyAdmin = await MCETHLPProxyAdmin.deploy();
    await mcethlpPoolProxyAdmin.deployed();
    console.log(`  MCETHLP Pool ProxyAdmin deployed to ${mcethlpPoolProxyAdmin.address}`,'\n');


    // First deploy implementations: TimeLockNonTransferablePool
    console.log("  Deploying MCETHLP Pool Implementation");
    const MCMCETHLPPoolFactory = new TimeLockNonTransferablePool__factory(signers[0]);
    mcethlpPoolImplementation = await MCMCETHLPPoolFactory.deploy();
    await mcethlpPoolImplementation.deployed();
    console.log(`  MCETHLP Pool Implementation deployed to ${mcethlpPoolImplementation.address}`,'\n');

    const MCETHLPPoolInitializeParams = [
        "Staked Merit Circle Uniswap LP",
        "sMCUNILPV2",
        MCETHLP_TOKEN,
        MC_TOKEN,
        ESCROW_POOL,
        ESCROW_PORTION,
        ESCROW_DURATION,
        MAX_BONUS,
        MAX_LOCK_DURATION,
        CURVE
    ]

    const MCETHLPPoolImplementationInterface = new hre.ethers.utils.Interface(JSON.stringify(TimeLockNonTransferablePoolJSON.abi))
    const MCETHLPPool_encoded_data = MCETHLPPoolImplementationInterface.encodeFunctionData("initialize", MCETHLPPoolInitializeParams);

    // Deploy the proxy and initialize with specific pool parameters
    console.log("  Deploying MCETHLP Pool Proxy");
    const MCETHLPPoolProxyDeploy = new TransparentUpgradeableProxy__factory(signers[0]);
    mcethlpPoolProxyDeploy = await MCETHLPPoolProxyDeploy.deploy(
        mcethlpPoolImplementation.address,
        mcethlpPoolProxyAdmin.address,
        MCETHLPPool_encoded_data
    );
    await mcethlpPoolProxyDeploy.deployed();
    console.log(`  MCETHLP Pool Proxy deployed to ${mcethlpPoolProxyDeploy.address}`,'\n\n');
    mcethlpPoolProxy = new ethers.Contract(mcethlpPoolProxyDeploy.address, MCETHLPPoolImplementationInterface, signers[0]);



    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Role assignment ////////////////////////////////////////////////////////////////////////////////////
    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    console.log("Assigning roles:");
    const GOV_ROLE = await mcPoolProxy.GOV_ROLE();
    const DEFAULT_ADMIN_ROLE = await mcPoolProxy.DEFAULT_ADMIN_ROLE();
    
    console.log(`  MULTISIG (${MULTISIG}) recieved GOV_ROLE of mcPoolProxy (${mcPoolProxy.address})`);
    await mcPoolProxy.grantRole(GOV_ROLE, MULTISIG);
    const govRoleMcPool = await mcPoolProxy.hasRole(GOV_ROLE, MULTISIG);

    console.log(`  MULTISIG (${MULTISIG}) recieved DEFAULT_ADMIN_ROLE of mcPoolProxy (${mcPoolProxy.address})`);
    await mcPoolProxy.grantRole(DEFAULT_ADMIN_ROLE, MULTISIG);
    const adminRoleMcPool = await mcPoolProxy.hasRole(DEFAULT_ADMIN_ROLE, MULTISIG);

    console.log(`  MULTISIG (${MULTISIG}) recieved GOV_ROLE of mcethlpPoolProxy (${mcethlpPoolProxy.address})`);
    await mcethlpPoolProxy.grantRole(GOV_ROLE, MULTISIG);
    const govRoleMcethlpPool = await mcethlpPoolProxy.hasRole(GOV_ROLE, MULTISIG);
    
    console.log(`  MULTISIG (${MULTISIG}) recieved DEFAULT_ADMIN_ROLE of mcethlpPoolProxy (${mcethlpPoolProxy.address})`,'\n\n');
    await mcethlpPoolProxy.grantRole(DEFAULT_ADMIN_ROLE, MULTISIG);
    const adminRoleMcethlpPool = await mcethlpPoolProxy.hasRole(DEFAULT_ADMIN_ROLE, MULTISIG);

    console.log("CHECK MANUALLY IF EVERYTHING IS CORRECTLY SETUP:");
    console.log(`  -MULTISIG has GOV_ROLE in both pools: ${govRoleMcPool}, ${govRoleMcethlpPool}`);
    console.log(`  -MULTISIG has DEFAULT_ADMIN_ROLE in both pools: ${adminRoleMcPool}, ${adminRoleMcethlpPool}`,'\n');

    console.log("THEN WITH THE DEPLOYER:");
    console.log("  -deposit for 4 years more than $100 MC in MC Pool");
    console.log("  -deposit for 4 years more than $100 LP in LP Pool");
    console.log("  -transfer ownership to MULTISIG in mcPoolProxyAdmin and mcethlpPoolProxyAdmin");
    console.log("  -renounce DEFAULT_ADMIN_ROLE in both pools",'\n');

    console.log("❤⭕");
}

deployUpgradeable().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});