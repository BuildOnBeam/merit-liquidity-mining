import { parseEther, formatEther } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { SSL_OP_SSLEAY_080_CLIENT_DH_BUG } from "constants";
import { BigNumber, constants } from "ethers";
import hre from "hardhat";
import { TestToken__factory, TimeLockPool__factory } from "../typechain";
import { TestToken } from "../typechain";
import { TimeLockPool } from "../typechain/TimeLockPool";
import TimeTraveler from "../utils/TimeTraveler";

const ESCROW_DURATION = 60 * 60 * 24 * 365;
const ESCROW_PORTION = parseEther("0.77");
const MAX_BONUS = parseEther("1");
const MAX_LOCK_DURATION = 60 * 60 * 24 * 365;
const INITIAL_MINT = parseEther("1000000");

describe("TimeLockPool", function () {

    let deployer: SignerWithAddress;
    let account1: SignerWithAddress;
    let account2: SignerWithAddress;
    let account3: SignerWithAddress;
    let account4: SignerWithAddress;
    let signers: SignerWithAddress[];

    let timeLockPool: TimeLockPool;
    let escrowPool: TimeLockPool;
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

        const timeLockPoolFactory = new TimeLockPool__factory(deployer);
        
        escrowPool = await timeLockPoolFactory.deploy(
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

        timeLockPool = await timeLockPoolFactory.deploy(
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

        await timeTraveler.snapshot();
    })

    beforeEach(async() => {
        await timeTraveler.revertSnapshot();
    })


    describe("deposit", async() => {

        const DEPOSIT_AMOUNT = parseEther("10");

        it("Depositing with no lock should lock it for 10 minutes to prevent flashloans", async() => {
            await timeLockPool.deposit(DEPOSIT_AMOUNT, 0, account3.address);
            const MIN_LOCK_DURATION = await timeLockPool.MIN_LOCK_DURATION();
            const deposit = await timeLockPool.depositsOf(account3.address, 0);
            const duration = await deposit.end.sub(deposit.start);
            expect(duration).to.eq(MIN_LOCK_DURATION);
        });

        it("Deposit with no lock", async() => {
            const depositTokenBalanceBefore = await depositToken.balanceOf(account1.address);
            await timeLockPool.deposit(DEPOSIT_AMOUNT, 0, account3.address);
            const depositTokenBalanceAfter = await depositToken.balanceOf(account1.address);

            const deposit = await timeLockPool.depositsOf(account3.address, 0);
            const depositCount = await timeLockPool.getDepositsOfLength(account3.address);
            const blockTimestamp = (await hre.ethers.provider.getBlock("latest")).timestamp;
            const totalDeposit = await timeLockPool.getTotalDeposit(account3.address);
            const timeLockPoolBalance = await timeLockPool.balanceOf(account3.address)
            const MIN_LOCK_DURATION = await timeLockPool.MIN_LOCK_DURATION();

            const multiplier = await timeLockPool.getMultiplier(MIN_LOCK_DURATION);

            expect(deposit.amount).to.eq(DEPOSIT_AMOUNT);
            expect(deposit.start).to.eq(blockTimestamp);
            expect(deposit.end).to.eq(BigNumber.from(blockTimestamp).add(MIN_LOCK_DURATION));
            expect(depositCount).to.eq(1);
            expect(totalDeposit).to.eq(DEPOSIT_AMOUNT);
            expect(timeLockPoolBalance).to.eq(DEPOSIT_AMOUNT.mul(multiplier).div(constants.WeiPerEther));
            expect(depositTokenBalanceAfter).to.eq(depositTokenBalanceBefore.sub(DEPOSIT_AMOUNT));
        });
        it("Trying to lock for longer than max duration should lock for max duration", async() => {
            const depositTokenBalanceBefore = await depositToken.balanceOf(account1.address);
            await timeLockPool.deposit(DEPOSIT_AMOUNT, constants.MaxUint256, account3.address);
            const depositTokenBalanceAfter = await depositToken.balanceOf(account1.address);

            const deposit = await timeLockPool.depositsOf(account3.address, 0);
            const depositCount = await timeLockPool.getDepositsOfLength(account3.address);
            const blockTimestamp = (await hre.ethers.provider.getBlock("latest")).timestamp;
            const totalDeposit = await timeLockPool.getTotalDeposit(account3.address);
            const timeLockPoolBalance = await timeLockPool.balanceOf(account3.address);

            expect(deposit.amount).to.eq(DEPOSIT_AMOUNT);
            expect(deposit.start).to.eq(blockTimestamp);
            expect(deposit.end).to.eq(BigNumber.from(blockTimestamp).add(MAX_LOCK_DURATION));
            expect(depositCount).to.eq(1);
            expect(totalDeposit).to.eq(DEPOSIT_AMOUNT);
            expect(timeLockPoolBalance).to.eq(DEPOSIT_AMOUNT.mul(constants.WeiPerEther.add(MAX_BONUS)).div(constants.WeiPerEther));

            expect(depositTokenBalanceAfter).to.eq(depositTokenBalanceBefore.sub(DEPOSIT_AMOUNT));
        })
        it("Multiple deposits", async() => {
            const depositTokenBalanceBefore = await depositToken.balanceOf(account1.address);
            await timeLockPool.deposit(DEPOSIT_AMOUNT, constants.MaxUint256, account3.address);
            const blockTimestamp1 = (await hre.ethers.provider.getBlock("latest")).timestamp;
            await timeLockPool.deposit(DEPOSIT_AMOUNT, constants.MaxUint256, account3.address);
            const blockTimestamp2 = (await hre.ethers.provider.getBlock("latest")).timestamp;
            const depositTokenBalanceAfter = await depositToken.balanceOf(account1.address);

            const deposits = await timeLockPool.getDepositsOf(account3.address);
            const totalDeposit = await timeLockPool.getTotalDeposit(account3.address);
            const timeLockPoolBalance = await timeLockPool.balanceOf(account3.address);

            expect(deposits[0].amount).to.eq(DEPOSIT_AMOUNT);
            expect(deposits[0].start).to.eq(blockTimestamp1);
            expect(deposits[0].end).to.eq(BigNumber.from(blockTimestamp1).add(MAX_LOCK_DURATION));

            expect(deposits[1].amount).to.eq(DEPOSIT_AMOUNT);
            expect(deposits[1].start).to.eq(blockTimestamp2);
            expect(deposits[1].end).to.eq(BigNumber.from(blockTimestamp2).add(MAX_LOCK_DURATION));

            expect(deposits.length).to.eq(2);
            expect(totalDeposit).to.eq(DEPOSIT_AMOUNT.mul(2));
            expect(timeLockPoolBalance).to.eq(DEPOSIT_AMOUNT.mul(2).mul(constants.WeiPerEther.add(MAX_BONUS)).div(constants.WeiPerEther));

            expect(depositTokenBalanceAfter).to.eq(depositTokenBalanceBefore.sub(DEPOSIT_AMOUNT.mul(2)));
        });
        it("Should fail when transfer fails", async() => {
            await depositToken.approve(timeLockPool.address, 0);
            await expect(timeLockPool.deposit(DEPOSIT_AMOUNT, 0, account3.address)).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
        });
    });
    describe("withdraw", async() => {
        const DEPOSIT_AMOUNT = parseEther("176.378");

        beforeEach(async() => {
            await timeLockPool.deposit(DEPOSIT_AMOUNT, constants.MaxUint256, account1.address);
        });

        it("Withdraw before expiry should fail", async() => {
            await expect(timeLockPool.withdraw(0, account1.address)).to.be.revertedWith("TimeLockPool.withdraw: too soon");
        });

        it("Should work", async() => {
            await timeTraveler.increaseTime(MAX_LOCK_DURATION);
            await timeLockPool.withdraw(0, account3.address);

            const timeLockPoolBalance = await timeLockPool.balanceOf(account1.address);
            const totalDeposit = await timeLockPool.getTotalDeposit(account1.address);
            const depositTokenBalance = await depositToken.balanceOf(account3.address);

            expect(timeLockPoolBalance).to.eq(0);
            expect(totalDeposit).to.eq(0);
            expect(depositTokenBalance).to.eq(DEPOSIT_AMOUNT);
        });
    });

    describe.only("extendLock1", async() => {
        const DEPOSIT_AMOUNT = parseEther("176.378");
        const THREE_MONTHS = MAX_LOCK_DURATION / 4;

        beforeEach(async() => {
            await timeLockPool.deposit(DEPOSIT_AMOUNT, THREE_MONTHS, account1.address);
        });

        it("Extending with zero duration should fail", async() => {
            await expect(timeLockPool.extendLock1(0, 0)).to.be.revertedWith("ZeroDurationError()");
        });
        
        it("Extending when deposit has already expired should fail", async() => {
            await timeTraveler.increaseTime(MAX_LOCK_DURATION * 2);
            await expect(timeLockPool.extendLock1(0, THREE_MONTHS)).to.be.revertedWith("DepositExpiredError()");
        });

        it("Extending should emit event with the correct arguments", async() => {
            await expect(timeLockPool.extendLock1(0, THREE_MONTHS))
            .to.emit(timeLockPool, "LockExtended")
            .withArgs(THREE_MONTHS, account1.address);
        });

        it("Extending should change start and extend end time in the struct", async() => {
            const startUserDepostit = await timeLockPool.depositsOf(account1.address, 0);

            await timeLockPool.extendLock1(0, THREE_MONTHS * 2)

            const endUserDepostit = await timeLockPool.depositsOf(account1.address, 0);
            const latestBlockTimestamp = (await hre.ethers.provider.getBlock("latest")).timestamp;
            expect(endUserDepostit.start).to.be.eq(latestBlockTimestamp)
            expect(endUserDepostit.end.sub(endUserDepostit.start)).to.be.eq(startUserDepostit.end.sub(latestBlockTimestamp).add(THREE_MONTHS * 2))
        });

        it("Extending in between end and start should change start and extend end time in the struct", async() => {
            const startUserDepostit = await timeLockPool.depositsOf(account1.address, 0);

            const nextBlockTimestamp = (startUserDepostit.end.sub(startUserDepostit.start)).div(2).add(startUserDepostit.start).toNumber();

            await timeTraveler.setNextBlockTimestamp(nextBlockTimestamp);

            await timeLockPool.extendLock1(0, THREE_MONTHS * 2)

            const endUserDepostit = await timeLockPool.depositsOf(account1.address, 0);
            const latestBlockTimestamp = (await hre.ethers.provider.getBlock("latest")).timestamp;
            expect(endUserDepostit.start).to.be.eq(latestBlockTimestamp)
            expect(endUserDepostit.end.sub(endUserDepostit.start)).to.be.eq(startUserDepostit.end.sub(latestBlockTimestamp).add(THREE_MONTHS * 2))
        });

        it("Extending should mint correct amount of tokens and change shareAmount in the struct", async() => {
            const startUserDepostit = await timeLockPool.depositsOf(account1.address, 0);
            const startBalance = await timeLockPool.balanceOf(account1.address);

            await timeLockPool.extendLock1(0, THREE_MONTHS * 2)

            const endUserDepostit = await timeLockPool.depositsOf(account1.address, 0);
            const endBalance = await timeLockPool.balanceOf(account1.address);

            expect(startBalance).to.be.eq(startUserDepostit.shareAmount)
            expect(endBalance).to.be.eq(endUserDepostit.shareAmount)
            
            const latestBlockTimestamp = (await hre.ethers.provider.getBlock("latest")).timestamp;
            const sixMonthsMultiplier = await timeLockPool.getMultiplier(startUserDepostit.end.sub(latestBlockTimestamp).add(THREE_MONTHS * 2));
            const theoreticalEndShareAmount = DEPOSIT_AMOUNT.mul(sixMonthsMultiplier).div(parseEther("1"));

            expect(theoreticalEndShareAmount).to.be.eq(endUserDepostit.shareAmount).to.be.eq(endBalance);
        });

        it("Extending in between end and start should mint correct amount of tokens and change shareAmount in the struct", async() => {
            const startUserDepostit = await timeLockPool.depositsOf(account1.address, 0);
            const startBalance = await timeLockPool.balanceOf(account1.address);

            const nextBlockTimestamp = (startUserDepostit.end.sub(startUserDepostit.start)).div(2).add(startUserDepostit.start).toNumber();

            await timeTraveler.setNextBlockTimestamp(nextBlockTimestamp);

            await timeLockPool.extendLock1(0, THREE_MONTHS * 2)

            const endUserDepostit = await timeLockPool.depositsOf(account1.address, 0);
            const endBalance = await timeLockPool.balanceOf(account1.address);

            expect(startBalance).to.be.eq(startUserDepostit.shareAmount)
            expect(endBalance).to.be.eq(endUserDepostit.shareAmount)
            
            const latestBlockTimestamp = (await hre.ethers.provider.getBlock("latest")).timestamp;
            const sixMonthsMultiplier = await timeLockPool.getMultiplier(startUserDepostit.end.sub(latestBlockTimestamp).add(THREE_MONTHS * 2));
            const theoreticalEndShareAmount = DEPOSIT_AMOUNT.mul(sixMonthsMultiplier).div(parseEther("1"));

            expect(theoreticalEndShareAmount).to.be.eq(endUserDepostit.shareAmount).to.be.eq(endBalance);
        });
    });

    describe("extendLock2", async() => {
        const DEPOSIT_AMOUNT = parseEther("176.378");
        const THREE_MONTHS = MAX_LOCK_DURATION / 4;

        beforeEach(async() => {
            await timeLockPool.deposit(DEPOSIT_AMOUNT, THREE_MONTHS, account1.address);
        });

        it("Extending with zero duration should fail", async() => {
            await expect(timeLockPool.extendLock2(0, 0)).to.be.revertedWith("ZeroDurationError()");
        });
        
        it("Extending when deposit has already expired should fail", async() => {
            await timeTraveler.increaseTime(MAX_LOCK_DURATION * 2);
            await expect(timeLockPool.extendLock2(0, THREE_MONTHS)).to.be.revertedWith("DepositExpiredError()");
        });

        it("Extending should emit event with the correct arguments", async() => {
            await expect(timeLockPool.extendLock2(0, THREE_MONTHS))
            .to.emit(timeLockPool, "LockExtended")
            .withArgs(THREE_MONTHS, account1.address);
        });

        it("Extending should extend the end time in the struct", async() => {
            const startUserDepostit = await timeLockPool.depositsOf(account1.address, 0);
            expect(startUserDepostit.end.sub(startUserDepostit.start)).to.be.eq(THREE_MONTHS);

            await timeLockPool.extendLock2(0, THREE_MONTHS)

            const endUserDepostit = await timeLockPool.depositsOf(account1.address, 0);
            expect(endUserDepostit.end.sub(endUserDepostit.start)).to.be.eq(THREE_MONTHS * 2);
        });

        it("Extending should mint correct amount of tokens and change shareAmount in the struct", async() => {
            const startUserDepostit = await timeLockPool.depositsOf(account1.address, 0);
            const startBalance = await timeLockPool.balanceOf(account1.address);

            await timeLockPool.extendLock2(0, THREE_MONTHS)

            const endUserDepostit = await timeLockPool.depositsOf(account1.address, 0);
            const endBalance = await timeLockPool.balanceOf(account1.address);

            expect(startBalance).to.be.eq(startUserDepostit.shareAmount)
            expect(endBalance).to.be.eq(endUserDepostit.shareAmount)
            
            const sixMonthsMultiplier = await timeLockPool.getMultiplier((THREE_MONTHS * 2));
            const theoreticalEndShareAmount = DEPOSIT_AMOUNT.mul(sixMonthsMultiplier).div(parseEther("1"));

            expect(theoreticalEndShareAmount).to.be.eq(endUserDepostit.shareAmount).to.be.eq(endBalance);
        });
    });

    describe("increaseLock", async() => {
        const DEPOSIT_AMOUNT = parseEther("176.378");
        const INCREASE_AMOUNT = parseEther("50");

        beforeEach(async() => {
            await timeLockPool.deposit(DEPOSIT_AMOUNT, constants.MaxUint256, account1.address);
        });

        it("Increasing with zero amount should fail", async() => {
            await expect(timeLockPool.increaseLock(0, account1.address, 0)).to.be.revertedWith("ZeroAmountError()");
        });
        
        it("Increasing when deposit has already expired should fail", async() => {
            await timeTraveler.increaseTime(MAX_LOCK_DURATION * 2);
            await expect(timeLockPool.increaseLock(0, account1.address, INCREASE_AMOUNT)).to.be.revertedWith("DepositExpiredError()");
        });

        it("Increasing should emit event with the correct arguments", async() => {
            await expect(timeLockPool.increaseLock(0, account1.address, INCREASE_AMOUNT))
            .to.emit(timeLockPool, "LockIncreased")
            .withArgs(0, account1.address, account1.address, INCREASE_AMOUNT);
        });

        it("Increasing should mint correct amount of tokens and change shareAmount in the struct", async() => {
            const startUserDepostit = await timeLockPool.depositsOf(account1.address, 0);
            const startBalance = await timeLockPool.balanceOf(account1.address);

            await timeLockPool.increaseLock(0, account1.address, INCREASE_AMOUNT);

            const increaseTimestamp = (await hre.ethers.provider.getBlock("latest")).timestamp;

            const endUserDepostit = await timeLockPool.depositsOf(account1.address, 0);
            const endBalance = await timeLockPool.balanceOf(account1.address);

            expect(startBalance).to.be.eq(startUserDepostit.shareAmount)
            expect(endBalance).to.be.eq(endUserDepostit.shareAmount)
            
            const multiplier = await timeLockPool.getMultiplier(startUserDepostit.end.sub(increaseTimestamp));
            const theoreticalIncrease = INCREASE_AMOUNT.mul(multiplier).div(parseEther("1"));

            expect(theoreticalIncrease.add(startUserDepostit.shareAmount)).to.be.eq(endUserDepostit.shareAmount).to.be.eq(endBalance);
        });

        it("Increasing in between start and end of deposit should do it correctly", async() => {
            const startUserDepostit = await timeLockPool.depositsOf(account1.address, 0);
            const startBalance = await timeLockPool.balanceOf(account1.address);

            const nextBlockTimestamp = (startUserDepostit.end.sub(startUserDepostit.start)).div(2).add(startUserDepostit.start).toNumber();

            await timeTraveler.setNextBlockTimestamp(nextBlockTimestamp);

            await timeLockPool.increaseLock(0, account1.address, INCREASE_AMOUNT);
            const latestBlockTimestamp = (await hre.ethers.provider.getBlock("latest")).timestamp;

            const endUserDepostit = await timeLockPool.depositsOf(account1.address, 0);
            const endBalance = await timeLockPool.balanceOf(account1.address);

            expect(startBalance).to.be.eq(startUserDepostit.shareAmount)
            expect(endBalance).to.be.eq(endUserDepostit.shareAmount)
            
            // Using latest timestamp because setting next block timestamp may differ for some seconds
            const multiplier = await timeLockPool.getMultiplier(startUserDepostit.end.sub(latestBlockTimestamp));
            const theoreticalIncrease = INCREASE_AMOUNT.mul(multiplier).div(parseEther("1"));

            expect(theoreticalIncrease.add(startUserDepostit.shareAmount)).to.be.eq(endUserDepostit.shareAmount).to.be.eq(endBalance);
        });
    });
});