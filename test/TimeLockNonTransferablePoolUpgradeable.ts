import { parseEther } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, constants, Contract } from "ethers";
import hre from "hardhat";
import { HeritageClause } from "typescript";
import { TestToken__factory, TimeLockNonTransferablePool__factory, TimeLockNonTransferablePoolV2, Box, BoxV2 } from "../typechain";
import { TestToken } from "../typechain";
import { TimeLockNonTransferablePool } from "../typechain/TimeLockNonTransferablePool";
import TimeTraveler from "../utils/TimeTraveler";

import { UpgradeableContract } from '@openzeppelin/upgrades-core';

const ESCROW_DURATION = 60 * 60 * 24 * 365;
const ESCROW_PORTION = parseEther("0.77");
const MAX_BONUS = parseEther("1");
const MAX_LOCK_DURATION = 60 * 60 * 24 * 365;
const INITIAL_MINT = parseEther("1000000");
const DEPOSIT_AMOUNT = parseEther("1000");

describe.only("TimeLockNonTransferablePool", function () {

    let deployer: SignerWithAddress;
    let account1: SignerWithAddress;
    let account2: SignerWithAddress;
    let account3: SignerWithAddress;
    let account4: SignerWithAddress;
    let signers: SignerWithAddress[];

    let timeLockNonTransferablePool: TimeLockNonTransferablePool;
    let timeLockPool: TimeLockNonTransferablePool;
    let escrowPool: TimeLockNonTransferablePool;
    let depositToken: TestToken;
    let rewardToken: TestToken;
    
    const timeTraveler = new TimeTraveler(hre.network.provider);

    before(async() => {

        [
            deployer,
            account1,
            account2,
            account3,
            account4,
            ...signers
        ] = await hre.ethers.getSigners();
        
        const testTokenFactory = await new TestToken__factory(deployer);

        depositToken = await testTokenFactory.deploy("DPST", "Deposit Token");
        rewardToken = await testTokenFactory.deploy("RWRD", "Reward Token");

        await depositToken.mint(account1.address, INITIAL_MINT);
        await rewardToken.mint(account1.address, INITIAL_MINT);

        escrowPool = await new TimeLockNonTransferablePool__factory(deployer).deploy();

        escrowPool.connect(deployer).initializeTimeLockNonTransferablePool(
            "ESCROW",
            "ESCRW",
            rewardToken.address,
            constants.AddressZero,
            constants.AddressZero,
            0,
            0,
            0,
            ESCROW_DURATION
        );

        timeLockPool = await new TimeLockNonTransferablePool__factory(deployer).deploy();

        timeLockPool.connect(deployer).initializeTimeLockNonTransferablePool(
            "Staking Pool",
            "STK",
            depositToken.address,
            rewardToken.address,
            escrowPool.address,
            ESCROW_PORTION,
            ESCROW_DURATION,
            MAX_BONUS,
            MAX_LOCK_DURATION
        );
        
        // connect account1 to all contracts
        timeLockPool = timeLockPool.connect(account1);
        escrowPool = escrowPool.connect(account1);
        depositToken = depositToken.connect(account1);
        rewardToken = rewardToken.connect(account1);
        
        await depositToken.approve(timeLockPool.address, constants.MaxUint256);
        await timeLockPool.deposit(DEPOSIT_AMOUNT, constants.MaxUint256, account1.address);

        await timeTraveler.snapshot();
        
    })
    
    beforeEach(async() => {
        await timeTraveler.revertSnapshot();
    })
    
    describe("Upgradeability", async () => {

        it.only("Upgradeable TEST", async () => {
            let box:Contract
            

            //const Box = await hre.ethers.getContractFactory("Box")
            //const BoxV2 = await hre.ethers.getContractFactory("BoxV2")

            const buildInfo = await hre.artifacts.getBuildInfo("contracts/upgradeable/Box.sol:Box");
            //const solcOutput = await hre.artifacts.getBuildInfo("contracts/TimeLockNonTransferablePoolV2.sol:TimeLockNonTransferablePoolV2");
            //const solcInput = buildInfo.input.sources["contracts/TimeLockNonTransferablePool.sol"];
            if(buildInfo) {
                console.log("1")
                const contract = new UpgradeableContract("Box", buildInfo['input'], buildInfo['output']);
                const contractV2 = new UpgradeableContract("BoxV2", buildInfo['input'], buildInfo['output']);
                const errorReport = contract.getErrorReport()
                const storageUpgradeReport = contract.getStorageUpgradeReport(contractV2)
                
                console.log("errorReport", errorReport)
                console.log("storageUpgradeReport", storageUpgradeReport)

            }

            const Box = await hre.ethers.getContractFactory("Box");
            box = await hre.upgrades.deployProxy(
                Box,
                [],
                { initializer: 'initializeTokenSaver' }
            );
            box = await Box.deploy();

            const dar = await box.DEFAULT_ADMIN_ROLE()
            console.log("dar", dar)


            let boxV2:Contract

            const BoxV2 = await hre.ethers.getContractFactory("BoxV2");

            const proxyAddress = box.address;
            const implementationAddress = await hre.upgrades.erc1967.getImplementationAddress(box.address);
            const adminAddress = await hre.upgrades.erc1967.getAdminAddress(box.address);

            boxV2 = await hre.upgrades.upgradeProxy(proxyAddress, BoxV2)

            await BoxV2.deploy();

            const dar2 = await boxV2.DEFAULT_ADMIN_ROLE()
            console.log("dar2", dar2)

            /*

            let tokenSaver: Contract;
            const TokenSaver = await hre.ethers.getContractFactory("TokenSaver");
            tokenSaver = await hre.upgrades.deployProxy(TokenSaver, [], { initializer: 'initializeTokenSaver' });
            await tokenSaver.deployed();

            const proxyAddress = tokenSaver.address;
            const implementationAddress = await hre.upgrades.erc1967.getImplementationAddress(tokenSaver.address);
            const adminAddress = await hre.upgrades.erc1967.getAdminAddress(tokenSaver.address);

            const proxyContract = await hre.ethers.getContractAt("TokenSaver", proxyAddress)
            const implementationContract = await hre.ethers.getContractAt("TokenSaver", implementationAddress)
            const adminContract = await hre.ethers.getContractAt("TokenSaver", adminAddress)

            const DEFAULT_ADMIN_ROLE = await proxyContract.DEFAULT_ADMIN_ROLE();
            console.log("DEFAULT_ADMIN_ROLE:", DEFAULT_ADMIN_ROLE);
            */
        })

        it("Upgradeable", async() => {

            let tlntp: Contract;

            const Tlntp = await hre.ethers.getContractFactory("TimeLockNonTransferablePool");

            tlntp = await hre.upgrades.deployProxy(
                Tlntp,
                [
                    "Staking Pool",
                    "STK",
                    depositToken.address,
                    rewardToken.address,
                    escrowPool.address,
                    ESCROW_PORTION,
                    ESCROW_DURATION,
                    MAX_BONUS,
                    MAX_LOCK_DURATION
                ],
                { initializer: 'initializeTimeLockNonTransferablePool' }
            );
            await tlntp.deployed();

            const proxyAddress = tlntp.address;
            const implementationAddress = await hre.upgrades.erc1967.getImplementationAddress(tlntp.address);
            const adminAddress = await hre.upgrades.erc1967.getAdminAddress(tlntp.address);

            console.log(proxyAddress," tlntp(proxy) address");
            console.log(implementationAddress," getImplementationAddress")
            console.log(adminAddress," getAdminAddress")
            
            const proxyContract = await hre.ethers.getContractAt("TimeLockNonTransferablePool", proxyAddress)
            const implementationContract = await hre.ethers.getContractAt("TimeLockNonTransferablePool", implementationAddress)
            const adminContract = await hre.ethers.getContractAt("TimeLockNonTransferablePool", adminAddress)
            
            // TODO test that the variables are in contract V1 and not in contract V2
/*
            const TOKEN_SAVER_ROLE_implementation = await implementationContract.TOKEN_SAVER_ROLE();
            console.log("TOKEN_SAVER_ROLE_implementation:", TOKEN_SAVER_ROLE_implementation);

            const TOKEN_SAVER_ROLE = await proxyContract.TOKEN_SAVER_ROLE();
            console.log("TOKEN_SAVER_ROLE:", TOKEN_SAVER_ROLE);
*/          
            
            const maxLockDurationProxy = await proxyContract.maxLockDuration();
            console.log("maxLockDurationProxy:", maxLockDurationProxy.toString());
            
            expect(maxLockDurationProxy).to.be.equal(MAX_LOCK_DURATION);

            const maxLockDurationImplementation = await implementationContract.maxLockDuration();
            console.log("maxLockDurationImplementation:", maxLockDurationImplementation.toString());

            expect(maxLockDurationImplementation).to.be.equal(0);

            const buildInfo = await hre.artifacts.getBuildInfo("contracts/TimeLockNonTransferablePool.sol:TimeLockNonTransferablePool");
            //const solcOutput = await hre.artifacts.getBuildInfo("contracts/TimeLockNonTransferablePoolV2.sol:TimeLockNonTransferablePoolV2");
            //const solcInput = buildInfo.input.sources["contracts/TimeLockNonTransferablePool.sol"];
            if(buildInfo) {

                const contract = new UpgradeableContract("TimeLockNonTransferablePool", buildInfo['input'], buildInfo['output']);
                const contractV2 = new UpgradeableContract("TimeLockNonTransferablePoolV2", buildInfo['input'], buildInfo['output']);

                const errorReport = contract.getErrorReport()
                console.log("errorReport", errorReport)

                const storageUpgradeReport = contract.getStorageUpgradeReport(contractV2)
                console.log("storageUpgradeReport", storageUpgradeReport)
            }
            //console.log(solcOutput);
            
            

            //const contract = new UpgradeableContract("sarasa", solcInput, solcOutput);


/*
            let tlntpV2: Contract;

            const TlntpV2 = await hre.ethers.getContractFactory("TimeLockNonTransferablePoolV2");

            //tlntpV2Address = await hre.upgrades.prepareUpgrade(proxyAddress, TlntpV2)
            
            tlntpV2 = await hre.upgrades.upgradeProxy(proxyAddress, TlntpV2)
            
            
            //tlntpV2 = await TlntpV2.deployed();
            //await tlntpV2.deployed();
    */
        })

    })

    it("initializer", async() => {

        //console.log(timeLockPool.functions)
        const admrole = await escrowPool.DEFAULT_ADMIN_ROLE();
        console.log("admrole", admrole)

        const hasadmnrole = await escrowPool.hasRole(admrole, deployer.address)
        console.log("hasadmnrole", hasadmnrole)


        await expect(escrowPool.connect(deployer).initializeTimeLockNonTransferablePool(
            "ESCROW",
            "ESCRW",
            rewardToken.address,
            constants.AddressZero,
            constants.AddressZero,
            0,
            0,
            0,
            ESCROW_DURATION
        )).to.be.revertedWith("Initializable: contract is already initialized")

        await expect(timeLockPool.connect(deployer).initializeTimeLockNonTransferablePool(
            "Staking Pool",
            "STK",
            depositToken.address,
            rewardToken.address,
            escrowPool.address,
            ESCROW_PORTION,
            ESCROW_DURATION,
            MAX_BONUS,
            MAX_LOCK_DURATION
        )).to.be.revertedWith("Initializable: contract is already initialized")
    })

    it("transfer", async() => {
        await expect(timeLockPool.transfer(account3.address, DEPOSIT_AMOUNT)).to.be.revertedWith("NON_TRANSFERABLE");
    });

    it("transferFrom", async() => {
        await expect(timeLockPool.transferFrom(account1.address, account3.address, DEPOSIT_AMOUNT)).to.be.revertedWith("NON_TRANSFERABLE");
    });
    
});


