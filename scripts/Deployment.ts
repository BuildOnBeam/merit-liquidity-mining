import { constants, Contract } from "ethers";
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

// MAINNET
// 0x7e9e4c0876B2102F33A1d82117Cc73B7FddD0032 | Merit Circle Multisig
// 0x949D48EcA67b17269629c7194F4b727d4Ef9E5d6 | Merit Circle (MC)
// 0xcCb63225a7B19dcF66717e4d40C9A72B39331d61 | MC/ETH Uni V2 LP (MCETHLP)
// 0xfEEA44bc2161F2Fe11D55E557ae4Ec855e2D1168 | Escrowed Merit Circle (eMC)

// 0x5c76aD4764A4607cD57644faA937A8cA16729e39 | Staked MC pool (sMC)
// 0x44c01e5e4216f3162538914d9c7f5E6A0d87820e | Staked MC LP (sMCETHLP)



// Goerli deployment
//const MC_TOKEN: string = "0xc8dB38cC85C721a16621d54F8c7f473c4CB221bE";
//const MCETHLP_TOKEN: string = "0x9524fAef30e1963e00F218b43033ebe0E75d42ca";
//ESCROW_POOL: string = "0xE0f7269d7B7Ae96D372450dcB6C7Ad2b10ab98fA";

const MC_TOKEN: string = "0x949D48EcA67b17269629c7194F4b727d4Ef9E5d6";
const MCETHLP_TOKEN: string = "0xcCb63225a7B19dcF66717e4d40C9A72B39331d61";
const ESCROW_POOL: string = "0xfEEA44bc2161F2Fe11D55E557ae4Ec855e2D1168";
const MULTISIG: string = "0x7e9e4c0876B2102F33A1d82117Cc73B7FddD0032";

async function deployUpgradeable() {
    const signers = await ethers.getSigners();

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
    console.log(`  MC Pool ProxyAdmin deployed to ${mcPoolProxyAdmin.address}`,'\n');


    // First deploy implementations: TimeLockNonTransferablePool
    console.log("  Deploying MC Pool Implementation");
    const MCPoolFactory = new TimeLockNonTransferablePool__factory(signers[0]);
    mcPoolImplementation = await MCPoolFactory.deploy();
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
    console.log(MCPool_encoded_data);
    console.log(mcPoolImplementation.functions)

    // Deploy the proxy and initialize with specific pool parameters
    console.log("  Deploying MC Pool Proxy");
    const MCPoolProxyDeploy = new TransparentUpgradeableProxy__factory(signers[0]);
    mcPoolProxyDeploy = await MCPoolProxyDeploy.deploy(
        mcPoolImplementation.address,
        mcPoolProxyAdmin.address,
        MCPool_encoded_data, {gasLimit: 30000000}
    );
    console.log(`  MC Pool Proxy deployed to ${mcPoolProxyDeploy.address}`,'\n\n');
    mcPoolProxy = new ethers.Contract(mcPoolProxyDeploy.address, mcPoolImplementation.interface, signers[0]);





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
    console.log(`  MCETHLP Pool ProxyAdmin deployed to ${mcethlpPoolProxyAdmin.address}`,'\n');


    // First deploy implementations: TimeLockNonTransferablePool
    console.log("  Deploying MCETHLP Pool Implementation");
    const MCMCETHLPPoolFactory = new TimeLockNonTransferablePool__factory(signers[0]);
    mcethlpPoolImplementation = await MCMCETHLPPoolFactory.deploy();
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
    console.log(MCETHLPPool_encoded_data);

    // Deploy the proxy and initialize with specific pool parameters
    console.log("  Deploying MCETHLP Pool Proxy");
    const MCETHLPPoolProxyDeploy = new TransparentUpgradeableProxy__factory(signers[0]);
    mcethlpPoolProxyDeploy = await MCETHLPPoolProxyDeploy.deploy(
        mcethlpPoolImplementation.address,
        mcethlpPoolProxyAdmin.address,
        MCETHLPPool_encoded_data
    );
    console.log(`  MCETHLP Pool Proxy deployed to ${mcethlpPoolProxyDeploy.address}`,'\n\n');
    mcethlpPoolProxy = new ethers.Contract(mcethlpPoolProxyDeploy.address, mcethlpPoolImplementation.interface, signers[0]);



    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Role assignment ////////////////////////////////////////////////////////////////////////////////////
    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    console.log("Assigning roles:");
    const GOV_ROLE = await mcPoolProxy.GOV_ROLE();
    const DEFAULT_ADMIN_ROLE = await mcPoolProxy.DEFAULT_ADMIN_ROLE();
    
    console.log(`  MULTISIG (${MULTISIG}) recieved GOV_ROLE of mcPoolProxy (${mcPoolProxy.address})`);
    (await (await mcPoolProxy.grantRole(GOV_ROLE, MULTISIG)).wait(3));
    
    console.log(`  MULTISIG (${MULTISIG}) recieved DEFAULT_ADMIN_ROLE of mcPoolProxy (${mcPoolProxy.address})`);
    (await (await mcPoolProxy.grantRole(DEFAULT_ADMIN_ROLE, MULTISIG)).wait(3));
    
    console.log(`  MULTISIG (${MULTISIG}) recieved GOV_ROLE of mcethlpPoolProxy (${mcethlpPoolProxy.address})`);
    (await (await mcethlpPoolProxy.grantRole(GOV_ROLE, MULTISIG)).wait(3));
    
    console.log(`  MULTISIG (${MULTISIG}) recieved DEFAULT_ADMIN_ROLE of mcethlpPoolProxy (${mcethlpPoolProxy.address})`,'\n\n');
    (await (await mcethlpPoolProxy.grantRole(DEFAULT_ADMIN_ROLE, MULTISIG)).wait(3));

    console.log("CHECK IF EVERYTHING IS CORRECTLY SETUP AND THEN WITH THE DEPLOYER:");
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
