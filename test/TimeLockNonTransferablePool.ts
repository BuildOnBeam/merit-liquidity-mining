import { parseEther } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, constants, Contract } from "ethers";
import hre from "hardhat";
import { HeritageClause } from "typescript";
import { TestToken__factory, TimeLockNonTransferablePool__factory } from "../typechain";
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

describe("TimeLockNonTransferablePool", function () {

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
    
    it("transfer", async() => {
        await expect(timeLockPool.transfer(account3.address, DEPOSIT_AMOUNT)).to.be.revertedWith("NON_TRANSFERABLE");
    });

    it("transferFrom", async() => {
        await expect(timeLockPool.transferFrom(account1.address, account3.address, DEPOSIT_AMOUNT)).to.be.revertedWith("NON_TRANSFERABLE");
    });

    it("initializer", async() => {
        const adminRole = await escrowPool.DEFAULT_ADMIN_ROLE();
        const hasAdminRole = await escrowPool.hasRole(adminRole, deployer.address)
        expect(hasAdminRole).to.be.true;
        
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
    
    it("Deployed proxy should contain storage and not the implementation ", async() => {

        let timeLockNonTransferablePool: Contract;

        const TimeLockNonTransferablePool = await hre.ethers.getContractFactory("TimeLockNonTransferablePool");

        timeLockNonTransferablePool = await hre.upgrades.deployProxy(
            TimeLockNonTransferablePool,
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
        await timeLockNonTransferablePool.deployed();

        const proxyAddress = timeLockNonTransferablePool.address;
        const implementationAddress = await hre.upgrades.erc1967.getImplementationAddress(timeLockNonTransferablePool.address);
        const adminAddress = await hre.upgrades.erc1967.getAdminAddress(timeLockNonTransferablePool.address);
       
        const proxyContract = await hre.ethers.getContractAt("TimeLockNonTransferablePool", proxyAddress)
        const implementationContract = await hre.ethers.getContractAt("TimeLockNonTransferablePool", implementationAddress)
        
        const maxLockDurationProxy = await proxyContract.maxLockDuration();            
        expect(maxLockDurationProxy).to.be.equal(MAX_LOCK_DURATION);

        const maxLockDurationImplementation = await implementationContract.maxLockDuration();
        expect(maxLockDurationImplementation).to.be.equal(0);
    })
});


