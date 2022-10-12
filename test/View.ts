import { parseEther } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, constants, Contract } from "ethers";
import hre, { ethers } from "hardhat";
import {
    View__factory,
    TestToken__factory,
    TestTimeLockPool__factory,
    TimeLockNonTransferablePool__factory,
    OldTimeLockNonTransferablePool__factory,
} from "../typechain";
import { 
    View,
    TestToken,
    TimeLockPool,
    TimeLockNonTransferablePool,
    OldTimeLockNonTransferablePool
} from "../typechain";
import TimeTraveler from "../utils/TimeTraveler";

const ESCROW_DURATION = 60 * 60 * 24 * 365;
const ESCROW_PORTION = parseEther("0.77");
const MAX_BONUS = parseEther("10"); // Same as max value in the curve
const MAX_LOCK_DURATION = 60 * 60 * 24 * 365 * 4;
const INITIAL_MINT = parseEther("1000000");
const ESCROW_POOL = "0xfeea44bc2161f2fe11d55e557ae4ec855e2d1168";
const CURVE = [
    (0*1e18).toString(),
    (0.65*1e18).toString(),
    (1.5*1e18).toString(),
    (3*1e18).toString(),
    (5*1e18).toString()
]

describe("View", function () {

    let deployer: SignerWithAddress;
    let account1: SignerWithAddress;
    let account2: SignerWithAddress;
    let account3: SignerWithAddress;
    let account4: SignerWithAddress;
    let signers: SignerWithAddress[];

    let depositToken: TestToken;
    let rewardToken: TestToken;
    let timeLockPool: TimeLockPool;
    
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

        // Deploy to use its address as input in the initializer parameters of the implementation
        const testTimeLockPoolFactory = new TestTimeLockPool__factory(deployer);
       
        // Deploy the TimeLockPool implementation
        //const timeLockPoolFactory = new TestTimeLockPool__factory(deployer);
        timeLockPool = await testTimeLockPoolFactory.deploy(
            "Staking Pool",
            "STK",
            depositToken.address,
            rewardToken.address,
            ESCROW_POOL,
            ESCROW_PORTION.div(2),
            ESCROW_DURATION * 2,
            MAX_BONUS.mul(10),
            MAX_LOCK_DURATION,
            CURVE
        );

        const GOV_ROLE = await timeLockPool.GOV_ROLE();
        await timeLockPool.grantRole(GOV_ROLE, deployer.address);

        // connect account1 to all contracts
        timeLockPool = timeLockPool.connect(account1);
        depositToken = depositToken.connect(account1);
        rewardToken = rewardToken.connect(account1);
        
        await depositToken.approve(timeLockPool.address, constants.MaxUint256);

        await timeTraveler.snapshot();
    })

    beforeEach(async() => {
        await timeTraveler.revertSnapshot();
    })

    describe("fetching data", async() => {
        it("Should retrieve correct information from a user from one new pool", async() => {
            const viewFactory = new View__factory(deployer);
            let view: View;
            view = await viewFactory.deploy();

            const DEPOSIT_AMOUNT = parseEther("10");

            await timeLockPool.deposit(DEPOSIT_AMOUNT, 0, account3.address);
            await timeLockPool.deposit(DEPOSIT_AMOUNT.mul(2), 0, account3.address);
            const deposit0 = await timeLockPool.depositsOf(account3.address, 0);
            const deposit1 = await timeLockPool.depositsOf(account3.address, 1);

            const viewData = await view.fetchData(account3.address, [timeLockPool.address]);

            expect(viewData[0].poolAddress).to.be.eq(timeLockPool.address);

            expect(viewData[0].deposits[0].amount.toString()).to.be.eq(deposit0.amount.toString())
            expect(viewData[0].deposits[0].shareAmount.toString()).to.be.eq(deposit0.shareAmount.toString())
            expect(viewData[0].deposits[0].start.toString()).to.be.eq(deposit0.start.toString())
            expect(viewData[0].deposits[0].end.toString()).to.be.eq(deposit0.end.toString())

            expect(viewData[0].deposits[1].amount.toString()).to.be.eq(deposit1.amount.toString())
            expect(viewData[0].deposits[1].shareAmount.toString()).to.be.eq(deposit1.shareAmount.toString())
            expect(viewData[0].deposits[1].start.toString()).to.be.eq(deposit1.start.toString())
            expect(viewData[0].deposits[1].end.toString()).to.be.eq(deposit1.end.toString())
        });

        it("Should retrieve correct information from a user from multiple new pools", async() => {
            const viewFactory = new View__factory(deployer);
            let view: View;
            view = await viewFactory.deploy();

            let newPools:TimeLockNonTransferablePool[] = [];
            let newPoolsAddresses: string[] = [];
            let deposits: BigNumber[] = [];

            const DEPOSIT_AMOUNT = parseEther("1");
            const timeLockNonTransferablePoolFactory = new TimeLockNonTransferablePool__factory(deployer);

            for(let i = 0; i < 10; i++) {
                const pool = (await timeLockNonTransferablePoolFactory.deploy()).connect(account1);
                await pool.initialize(
                    "Staking Pool",
                    "STK",
                    depositToken.address,
                    rewardToken.address,
                    ESCROW_POOL,
                    ESCROW_PORTION,
                    ESCROW_DURATION,
                    MAX_BONUS,
                    MAX_LOCK_DURATION,
                    CURVE
                );
    
                const depositAmount = DEPOSIT_AMOUNT.mul(i+1);
                deposits.push(depositAmount);
                await depositToken.approve(pool.address, depositAmount);
                await pool.deposit(depositAmount, (i + 1) * 60 * 60 * 24 * 7, account1.address);
                                
                newPools.push(pool);
                newPoolsAddresses.push(pool.address);
            }


            const viewData = await view.fetchData(account1.address, newPoolsAddresses);

            for (let i = 0; i < viewData.length; i++) {
                expect(viewData[i].deposits[0].amount.toString()).to.be.eq(deposits[i].toString());
            }

            expect(viewData.length).to.be.eq(newPools.length).to.be.eq(newPoolsAddresses.length).to.be.eq(deposits.length)
        });

        it("Should retrieve correct information from a user from multiple old new pools", async() => {
            const viewFactory = new View__factory(deployer);
            let view: View;
            view = await viewFactory.deploy();

            let oldPools:OldTimeLockNonTransferablePool[] = [];
            let oldPoolsAddresses: string[] = [];
            let deposits: BigNumber[] = [];

            const DEPOSIT_AMOUNT = parseEther("1");
            const oldTimeLockNonTransferablePoolFactory = new OldTimeLockNonTransferablePool__factory(deployer);

            for(let i = 0; i < 10; i++) {
                const pool = (await oldTimeLockNonTransferablePoolFactory.deploy()).connect(account1);
                await pool.initialize(
                    "Staking Pool",
                    "STK",
                    depositToken.address,
                    rewardToken.address,
                    ESCROW_POOL,
                    ESCROW_PORTION,
                    ESCROW_DURATION,
                    MAX_BONUS,
                    MAX_LOCK_DURATION,
                    CURVE
                );
    
                const depositAmount = DEPOSIT_AMOUNT.mul(i+1);
                deposits.push(depositAmount);
                await depositToken.approve(pool.address, depositAmount);
                await pool.deposit(depositAmount, (i + 1) * 60 * 60 * 24 * 7, account1.address);
                                
                oldPools.push(pool);
                oldPoolsAddresses.push(pool.address);
            }


            const viewData = await view.fetchOldData(account1.address, oldPoolsAddresses);

            for (let i = 0; i < viewData.length; i++) {
                expect(viewData[i].deposits[0].amount.toString()).to.be.eq(deposits[i].toString());
            }

            expect(viewData.length).to.be.eq(oldPools.length).to.be.eq(oldPoolsAddresses.length).to.be.eq(deposits.length)
        });

        it("Should retrieve correct information from a user from multiple new and old pools", async() => {
            const viewFactory = new View__factory(deployer);
            let view: View;
            view = await viewFactory.deploy();

            let newPools:TimeLockNonTransferablePool[] = [];
            let newPoolsAddresses: string[] = [];
            let newDeposits: BigNumber[] = [];

            let oldPools:OldTimeLockNonTransferablePool[] = [];
            let oldPoolsAddresses: string[] = [];
            let oldDeposits: BigNumber[] = [];

            const DEPOSIT_AMOUNT = parseEther("1");

            const timeLockNonTransferablePoolFactory = new TimeLockNonTransferablePool__factory(deployer);

            for(let i = 0; i < 10; i++) {
                const pool = (await timeLockNonTransferablePoolFactory.deploy()).connect(account1);
                await pool.initialize(
                    "Staking Pool",
                    "STK",
                    depositToken.address,
                    rewardToken.address,
                    ESCROW_POOL,
                    ESCROW_PORTION,
                    ESCROW_DURATION,
                    MAX_BONUS,
                    MAX_LOCK_DURATION,
                    CURVE
                );
    
                const depositAmount = DEPOSIT_AMOUNT.mul(i+1);
                newDeposits.push(depositAmount);
                await depositToken.approve(pool.address, depositAmount);
                await pool.deposit(depositAmount, (i + 1) * 60 * 60 * 24 * 7, account1.address);
                                
                newPools.push(pool);
                newPoolsAddresses.push(pool.address);
            }


            const oldTimeLockNonTransferablePoolFactory = new OldTimeLockNonTransferablePool__factory(deployer);

            for(let i = 0; i < 10; i++) {
                const pool = (await oldTimeLockNonTransferablePoolFactory.deploy()).connect(account1);
                await pool.initialize(
                    "Staking Pool",
                    "STK",
                    depositToken.address,
                    rewardToken.address,
                    ESCROW_POOL,
                    ESCROW_PORTION,
                    ESCROW_DURATION,
                    MAX_BONUS,
                    MAX_LOCK_DURATION,
                    CURVE
                );
    
                const depositAmount = DEPOSIT_AMOUNT.mul(i+1);
                oldDeposits.push(depositAmount);
                await depositToken.approve(pool.address, depositAmount);
                await pool.deposit(depositAmount, (i + 1) * 60 * 60 * 24 * 7, account1.address);
                                
                oldPools.push(pool);
                oldPoolsAddresses.push(pool.address);
            }


            const viewData = await view.fetchBoth(account1.address, oldPoolsAddresses, newPoolsAddresses);

            const oldData = viewData[0];
            const newData = viewData[1];

            for (let i = 0; i < oldData.length; i++) {
                expect(oldData[i].deposits[0].amount.toString()).to.be.eq(oldDeposits[i].toString());
            }

            for (let i = 0; i < newData.length; i++) {
                expect(newData[i].deposits[0].amount.toString()).to.be.eq(newDeposits[i].toString());
            }

            expect(oldData.length).to.be.eq(oldPools.length).to.be.eq(oldPoolsAddresses.length).to.be.eq(oldDeposits.length).to.be.eq(newDeposits.length).to.be.eq(newData.length)
        });
    });
});