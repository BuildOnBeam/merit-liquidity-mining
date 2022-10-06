import { parseEther, formatEther } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { SSL_OP_SSLEAY_080_CLIENT_DH_BUG } from "constants";
import { BigNumber, constants, Contract } from "ethers";
import hre, { ethers } from "hardhat";
import {
    View__factory,
    TestToken__factory,
    TimeLockPool__factory,
    TestTimeLockPool__factory,
    ProxyAdmin__factory,
    TransparentUpgradeableProxy__factory,
    TimeLockNonTransferablePoolV2__factory
} from "../typechain";
import { 
    View,
    TestToken,
    TimeLockPool,
    TestTimeLockPool,
    ProxyAdmin,
    TransparentUpgradeableProxy,
    TimeLockNonTransferablePoolV2
} from "../typechain";
import TimeTraveler from "../utils/TimeTraveler";
import * as TimeLockPoolJSON from "../artifacts/contracts/TimeLockPool.sol/TimeLockPool.json";
import * as TimeLockNonTransferablePoolV2JSON from "../artifacts/contracts/test/TimeLockNonTransferablePoolV2.sol/TimeLockNonTransferablePoolV2.json";

const ESCROW_DURATION = 60 * 60 * 24 * 365;
const ESCROW_PORTION = parseEther("0.77");
const MAX_BONUS = parseEther("10"); // Same as max value in the curve
const MAX_BONUS_ESCROW = parseEther("1");
const MAX_LOCK_DURATION = 60 * 60 * 24 * 365 * 4;
const INITIAL_MINT = parseEther("1000000");
const FLAT_CURVE = [(1e18).toString(), (1e18).toString()];
const ESCROW_POOL = "0xfeea44bc2161f2fe11d55e557ae4ec855e2d1168";
const CURVE = [
    (0*1e18).toString(),
    (0.65*1e18).toString(),
    (1.5*1e18).toString(),
    (3*1e18).toString(),
    (5*1e18).toString()
]

function theoreticalMultiplier(
    _duration: any,
    curve: any
) {
    
    const unit = Math.floor(MAX_LOCK_DURATION / (curve.length - 1))
    const duration = Math.min(Math.max(Number(_duration), 600), MAX_LOCK_DURATION)
    const n = Math.floor(duration / unit)

    if (n == curve.length - 1) {
        const mcn = hre.ethers.BigNumber.from(curve[n])
        let result
        if(mcn.lt(MAX_BONUS)) {
            result = mcn.add(parseEther("1"))
        } else {
            result = MAX_BONUS.add(parseEther("1"))
        }

        return result.toString()
    }

    const mcn = hre.ethers.BigNumber.from(curve[n])
    const mcn1 = hre.ethers.BigNumber.from(curve[n + 1])
    const BNunit = hre.ethers.BigNumber.from(unit)
    const BNn = hre.ethers.BigNumber.from(n)
    const BNduration = hre.ethers.BigNumber.from(_duration)

    const res = mcn.add(BNduration.sub(BNn.mul(BNunit)).mul(mcn1.sub(mcn)).div(BNunit))
    let result
    if(res.lt(MAX_BONUS)) {
        result = res.add(parseEther("1"))
    } else {
        result = MAX_BONUS.add(parseEther("1"))
    }

    return result.toString()
}

describe("TimeLockPool", function () {

    let deployer: SignerWithAddress;
    let account1: SignerWithAddress;
    let account2: SignerWithAddress;
    let account3: SignerWithAddress;
    let account4: SignerWithAddress;
    let signers: SignerWithAddress[];

    let depositToken: TestToken;
    let rewardToken: TestToken;
    let timeLockPool: Contract;
    let testTimeLockPoolImplementation: TimeLockPool;
    let escrowPool: TestTimeLockPool;
    let proxyAdmin: ProxyAdmin;
    let proxy: TransparentUpgradeableProxy;
    
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

        escrowPool = await testTimeLockPoolFactory.deploy(
            "ESCROW",
            "ESCRW",
            rewardToken.address,
            constants.AddressZero,
            constants.AddressZero,
            0,
            0,
            MAX_BONUS_ESCROW,
            ESCROW_DURATION,
            FLAT_CURVE
        );
        
        // Deploy the TimeLockPool implementation
        //const timeLockPoolFactory = new TestTimeLockPool__factory(deployer);
        timeLockPool = await testTimeLockPoolFactory.deploy(
            "Staking Pool",
            "STK",
            depositToken.address,
            rewardToken.address,
            escrowPool.address,
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
            const maxMultiplier = await timeLockPool.getMultiplier(MAX_LOCK_DURATION);

            expect(deposit.amount).to.eq(DEPOSIT_AMOUNT);
            expect(deposit.start).to.eq(blockTimestamp);
            expect(deposit.end).to.eq(BigNumber.from(blockTimestamp).add(MAX_LOCK_DURATION));
            expect(depositCount).to.eq(1);
            expect(totalDeposit).to.eq(DEPOSIT_AMOUNT);
            expect(timeLockPoolBalance).to.eq(DEPOSIT_AMOUNT.mul(maxMultiplier).div(constants.WeiPerEther));

            expect(depositTokenBalanceAfter).to.eq(depositTokenBalanceBefore.sub(DEPOSIT_AMOUNT));
        })
        it("Multiple deposits", async() => {
            const depositTokenBalanceBefore = await depositToken.balanceOf(account1.address);
            await timeLockPool.deposit(DEPOSIT_AMOUNT, constants.MaxUint256, account3.address);
            const blockTimestamp1 = (await hre.ethers.provider.getBlock("latest")).timestamp;
            await timeLockPool.deposit(DEPOSIT_AMOUNT, constants.MaxUint256, account3.address);
            const blockTimestamp2 = (await hre.ethers.provider.getBlock("latest")).timestamp;
            const depositTokenBalanceAfter = await depositToken.balanceOf(account1.address);
            const maxMultiplier = await timeLockPool.getMultiplier(MAX_LOCK_DURATION);

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
            expect(timeLockPoolBalance).to.eq(DEPOSIT_AMOUNT.mul(2).mul(maxMultiplier).div(constants.WeiPerEther));

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
            await expect(timeLockPool.withdraw(0, account1.address)).to.be.revertedWith("TooSoonError()");
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

    describe("extendLock", async() => {
        const DEPOSIT_AMOUNT = parseEther("176.378");
        const THREE_MONTHS = MAX_LOCK_DURATION / 12;

        beforeEach(async() => {
            await timeLockPool.deposit(DEPOSIT_AMOUNT, THREE_MONTHS, account1.address);
        });

        it("Extending with zero duration should fail", async() => {
            await expect(timeLockPool.extendLock(0, 0)).to.be.revertedWith("ZeroDurationError()");
        });
        
        it("Extending when deposit has already expired should fail", async() => {
            await timeTraveler.increaseTime(MAX_LOCK_DURATION * 2);
            await expect(timeLockPool.extendLock(0, THREE_MONTHS)).to.be.revertedWith("DepositExpiredError()");
        });

        it("Extending should emit event with the correct arguments", async() => {
            await expect(timeLockPool.extendLock(0, THREE_MONTHS))
                .to.emit(timeLockPool, "LockExtended")
                .withArgs(0, THREE_MONTHS, account1.address);
        });

        it("Extending should change start and extend end time in the struct", async() => {
            const startUserDepostit = await timeLockPool.depositsOf(account1.address, 0);

            await timeLockPool.extendLock(0, THREE_MONTHS * 2)

            const endUserDepostit = await timeLockPool.depositsOf(account1.address, 0);
            const latestBlockTimestamp = (await hre.ethers.provider.getBlock("latest")).timestamp;
            // start of the deposit should be the block timestamp
            expect(endUserDepostit.start).to.be.eq(latestBlockTimestamp)
            // total length of the deposit should be the time left of the original deposit plus the time increased
            expect(endUserDepostit.end.sub(endUserDepostit.start)).to.be.eq(startUserDepostit.end.sub(latestBlockTimestamp).add(THREE_MONTHS * 2))
        });

        it("Extending in between end and start should change start and extend end time in the struct", async() => {
            const startUserDepostit = await timeLockPool.depositsOf(account1.address, 0);

            const nextBlockTimestamp = (startUserDepostit.end.sub(startUserDepostit.start)).div(2).add(startUserDepostit.start).toNumber();

            // Fastforward to half of the deposit time elapsed
            await timeTraveler.setNextBlockTimestamp(nextBlockTimestamp);

            await timeLockPool.extendLock(0, THREE_MONTHS * 2)

            const endUserDepostit = await timeLockPool.depositsOf(account1.address, 0);
            const latestBlockTimestamp = (await hre.ethers.provider.getBlock("latest")).timestamp;
            // start of the deposit should be the block timestamp
            expect(endUserDepostit.start).to.be.eq(latestBlockTimestamp)
            // total length of the deposit should be the time left of the original deposit plus the time increased
            expect(endUserDepostit.end.sub(endUserDepostit.start)).to.be.eq(startUserDepostit.end.sub(latestBlockTimestamp).add(THREE_MONTHS * 2))
        });

        it("Extending should mint correct amount of tokens and change shareAmount in the struct", async() => {
            const startUserDepostit = await timeLockPool.depositsOf(account1.address, 0);
            const startBalance = await timeLockPool.balanceOf(account1.address);

            await timeLockPool.extendLock(0, THREE_MONTHS * 2)

            const endUserDepostit = await timeLockPool.depositsOf(account1.address, 0);
            const endBalance = await timeLockPool.balanceOf(account1.address);

            expect(startBalance).to.be.eq(startUserDepostit.shareAmount)
            expect(endBalance).to.be.eq(endUserDepostit.shareAmount)
            
            const latestBlockTimestamp = (await hre.ethers.provider.getBlock("latest")).timestamp;
            // New multiplier comes from the curve by inputing the new duration of the lock
            const sixMonthsMultiplier = await timeLockPool.getMultiplier(startUserDepostit.end.sub(latestBlockTimestamp).add(THREE_MONTHS * 2));
            // New share amount is the deposit amount times the new multiplier.
            const theoreticalEndShareAmount = DEPOSIT_AMOUNT.mul(sixMonthsMultiplier).div(parseEther("1"));

            expect(theoreticalEndShareAmount).to.be.eq(endUserDepostit.shareAmount).to.be.eq(endBalance);
        });

        it("Extending in between end and start should mint correct amount of tokens and change shareAmount in the struct", async() => {
            const startUserDepostit = await timeLockPool.depositsOf(account1.address, 0);
            const startBalance = await timeLockPool.balanceOf(account1.address);

            const nextBlockTimestamp = (startUserDepostit.end.sub(startUserDepostit.start)).div(2).add(startUserDepostit.start).toNumber();
            
            // Fastforward to half of the deposit time elapsed
            await timeTraveler.setNextBlockTimestamp(nextBlockTimestamp);

            await timeLockPool.extendLock(0, THREE_MONTHS * 2)

            const endUserDepostit = await timeLockPool.depositsOf(account1.address, 0);
            const endBalance = await timeLockPool.balanceOf(account1.address);

            expect(startBalance).to.be.eq(startUserDepostit.shareAmount)
            expect(endBalance).to.be.eq(endUserDepostit.shareAmount)
            
            const latestBlockTimestamp = (await hre.ethers.provider.getBlock("latest")).timestamp;
            // New multiplier comes from the curve by inputing the new duration of the lock
            const sixMonthsMultiplier = await timeLockPool.getMultiplier(startUserDepostit.end.sub(latestBlockTimestamp).add(THREE_MONTHS * 2));
            // New share amount is the deposit amount times the new multiplier.
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
            
            // New multiplier comes from time from the timestamp when increased and the end of the lock
            const multiplier = await timeLockPool.getMultiplier(startUserDepostit.end.sub(increaseTimestamp));
            
            // Should increased the deposited amount times the multiplier
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

            // New multiplier comes from time from the timestamp when increased and the end of the lock
            const multiplier = await timeLockPool.getMultiplier(startUserDepostit.end.sub(latestBlockTimestamp));
            
            // Should increased the deposited amount times the multiplier
            const theoreticalIncrease = INCREASE_AMOUNT.mul(multiplier).div(parseEther("1"));
            expect(theoreticalIncrease.add(startUserDepostit.shareAmount)).to.be.eq(endUserDepostit.shareAmount).to.be.eq(endBalance);
        });
    });

    describe("getMultiplier", async() => {
        it("Left curve point should be relative to minimum time", async() => {
            // Left = first point in the curve
            const leftCurvePoint = await timeLockPool.getMultiplier(0);
            expect(leftCurvePoint).to.be.eq(theoreticalMultiplier(0, CURVE));
        });

        it("Right curve point should be relative to max time", async() => {
            // Right = last point in the curve
            const rightCurvePoint = await timeLockPool.getMultiplier(MAX_LOCK_DURATION);
            expect(rightCurvePoint).to.be.eq(theoreticalMultiplier(MAX_LOCK_DURATION, CURVE));
        });

        it("An intermediate time value should create a proportional intermediate multiplier", async() => {
            // Random from 1 to MAX_LOCK_DURATION - 1
            const intermediateTime = Math.floor(Math.random() * (MAX_LOCK_DURATION - 1)) + 1;
            const intermediateMultiplier = await timeLockPool.getMultiplier(intermediateTime);
            expect(intermediateMultiplier).to.be.eq(theoreticalMultiplier(intermediateTime, CURVE));
        });
    });

    describe("setCurve and setCurvePoint", async() => {
        it("Replacing a curve with a non gov role account should fail", async() => {
            // Mapping a new curve for replacing the old one
            const NEW_CURVE = CURVE.map(function(x) {
                return (hre.ethers.BigNumber.from(x).mul(2).toString())
            })
            await expect(timeLockPool.setCurve(NEW_CURVE)).to.be.revertedWith("NotGovError()");
        });

        it("Replacing a curve should emit an event", async() => {
            // Mapping a new curve for replacing the old one
            const NEW_CURVE = CURVE.map(function(x) {
                return (hre.ethers.BigNumber.from(x).mul(2).toString())
            })
            await expect(timeLockPool.connect(deployer).setCurve(NEW_CURVE))            
                .to.emit(timeLockPool, "CurveChanged")
                .withArgs(deployer.address);
        })

        it("Replacing with a same length curve should do it correctly", async() => {
            // Mapping a new curve for replacing the old one
            const NEW_CURVE = CURVE.map(function(x) {
                return (hre.ethers.BigNumber.from(x).mul(2).toString())
            })
            await timeLockPool.connect(deployer).setCurve(NEW_CURVE);

            for(let i=0; i< NEW_CURVE.length; i++){
                const curvePoint = await timeLockPool.curve(i);
                expect(curvePoint).to.be.eq(NEW_CURVE[i])
            }
            await expect(timeLockPool.curve(NEW_CURVE.length + 1)).to.be.reverted;
        })

        it("Replacing with a shorter curve should do it correctly", async() => {
            // Setting a two point element curve
            const NEW_CURVE = [(1e18).toString(), (2*1e18).toString()]
            await timeLockPool.connect(deployer).setCurve(NEW_CURVE);

            for(let i=0; i< NEW_CURVE.length; i++){
                const curvePoint = await timeLockPool.curve(i);
                expect(curvePoint).to.be.eq(NEW_CURVE[i])
            }
            await expect(timeLockPool.curve(NEW_CURVE.length + 1)).to.be.reverted;
        })

        it("Replacing with a longer curve should do it correctly", async() => {
            const NEW_RAW_CURVE = [
                0,
                0.113450636781733,
                0.23559102796425,
                0.367086765506204,
                0.508654422399196,
                0.661065457561288,
                0.825150419825931,
                1.00180347393553,
                1.19198727320361,
                1.39673820539865,
                1.61717204043653,
                1.85449001065813,
                2.10998535682594,
                2.38505037551144,
                2.6811840062773,
                3,
                3.34323571284532,
                3.71276157381861,
                4.11059127748229,
                4.53889275738489,
                5
            ]
           
            const NEW_CURVE = NEW_RAW_CURVE.map(function(x) {
                return (x*1e18).toString();
            })
            await timeLockPool.connect(deployer).setCurve(NEW_CURVE);

            for(let i=0; i< NEW_CURVE.length; i++){
                const curvePoint = await timeLockPool.curve(i);
                expect(curvePoint).to.be.eq(NEW_CURVE[i])
            }
            await expect(timeLockPool.curve(NEW_CURVE.length + 1)).to.be.reverted;
        })

        it("Replacing a point with a non gov role account should fail", async() => {
            await expect(timeLockPool.setCurvePoint((4*1e18).toString(), 3)).to.be.revertedWith("NotGovError()");
        });

        it("Replacing a point should emit an event", async() => {
            await expect(timeLockPool.connect(deployer).setCurvePoint((4*1e18).toString(), 3))            
                .to.emit(timeLockPool, "CurveChanged")
                .withArgs(deployer.address);
        })

        it("Replacing a point should do it correctly", async() => {
            const curvePoint = await timeLockPool.connect(deployer).curve(3);
            
            const newPoint = (4*1e18).toString();
            await timeLockPool.connect(deployer).setCurvePoint(newPoint, 3);

            const changedCurvePoint = await timeLockPool.curve(3);
            expect(curvePoint).not.to.be.eq(changedCurvePoint)
            expect(changedCurvePoint).to.be.eq(newPoint)
        })

        it("Adding a point should do it correctly", async() => {
            await expect(timeLockPool.connect(deployer).curve(5)).to.be.reverted;
            const newPoint = (4*1e18).toString();
            await timeLockPool.connect(deployer).setCurvePoint(newPoint, 5);
            
            const addedCurvePoint = await timeLockPool.curve(5);
            expect(addedCurvePoint).to.be.eq(newPoint)
        })

        it("Removing a point should do it correctly", async() => {
            const newPoint = (4*1e18).toString();
            await timeLockPool.connect(deployer).setCurvePoint(newPoint, 6);
            
            await expect(timeLockPool.curve(4)).to.be.reverted;
        })

        it("Removing a point from a curve with length two should revert", async() => {
            
            const NEW_CURVE = [(1e18).toString(), (2*1e18).toString()]
            await timeLockPool.connect(deployer).setCurve(NEW_CURVE);

            const newPoint = (4*1e18).toString();
            // A curve cannot have less than two elements, thus it must fail
            await expect(timeLockPool.connect(deployer).setCurvePoint(newPoint, 9)).to.be.revertedWith("ShortCurveError()");            
        })
    });    

    describe("Curve changes", async() => {
        beforeEach(async() => {
            await timeTraveler.revertSnapshot();
        })

        it("Curve should multiply correctly", async() => {
            const MIN_LOCK_DURATION = await timeLockPool.MIN_LOCK_DURATION();
            const minMultiplier = await timeLockPool.getMultiplier(MIN_LOCK_DURATION);
            const expectedResult1 = theoreticalMultiplier(MIN_LOCK_DURATION, CURVE)

            const oneYearDuration = MAX_LOCK_DURATION / 4;
            const oneYearMultiplier = await timeLockPool.getMultiplier(oneYearDuration);
            const expectedResult2 = theoreticalMultiplier(oneYearDuration, CURVE)

            const twoYearDuration = MAX_LOCK_DURATION / 2;
            const twoYearMultiplier = await timeLockPool.getMultiplier(twoYearDuration);
            const expectedResult3 = theoreticalMultiplier(twoYearDuration, CURVE)

            const threeYearDuration = MAX_LOCK_DURATION * 3 / 4;
            const threeYearMultiplier = await timeLockPool.getMultiplier(threeYearDuration);
            const expectedResult4 = theoreticalMultiplier(threeYearDuration, CURVE)

            const maxLockDuration = MAX_LOCK_DURATION;
            const maxMultiplier = await timeLockPool.getMultiplier(maxLockDuration);
            const expectedResult5 = theoreticalMultiplier(maxLockDuration, CURVE)

            const randomDuration = Math.floor(Math.random() * (MAX_LOCK_DURATION - 1)) + 1;
            const randomMultiplier = await timeLockPool.getMultiplier(randomDuration);
            const expectedResult6 = theoreticalMultiplier(randomDuration, CURVE)

            expect(expectedResult1).to.be.eq(minMultiplier)
            expect(expectedResult2).to.be.eq(oneYearMultiplier)
            expect(expectedResult3).to.be.eq(twoYearMultiplier)
            expect(expectedResult4).to.be.eq(threeYearMultiplier)
            expect(expectedResult5).to.be.eq(maxMultiplier)
            expect(expectedResult6).to.be.eq(randomMultiplier)
        });

        it("Change curve and multiply correctly", async() => {
            // Setting a new curve should still work while getting the multiplier
            const NEW_CURVE = CURVE.map(function(x) {
                return (hre.ethers.BigNumber.from(x).mul(2).toString())
            })
            await timeLockPool.connect(deployer).setCurve(NEW_CURVE);

            const MIN_LOCK_DURATION = await timeLockPool.MIN_LOCK_DURATION();
            const minMultiplier = await timeLockPool.getMultiplier(MIN_LOCK_DURATION);
            const expectedResult1 = theoreticalMultiplier(MIN_LOCK_DURATION, NEW_CURVE)

            const oneYearDuration = MAX_LOCK_DURATION / 4;
            const oneYearMultiplier = await timeLockPool.getMultiplier(oneYearDuration);
            const expectedResult2 = theoreticalMultiplier(oneYearDuration, NEW_CURVE)

            const twoYearDuration = MAX_LOCK_DURATION / 2;
            const twoYearMultiplier = await timeLockPool.getMultiplier(twoYearDuration);
            const expectedResult3 = theoreticalMultiplier(twoYearDuration, NEW_CURVE)

            const threeYearDuration = MAX_LOCK_DURATION * 3 / 4;
            const threeYearMultiplier = await timeLockPool.getMultiplier(threeYearDuration);
            const expectedResult4 = theoreticalMultiplier(threeYearDuration, NEW_CURVE)

            const maxLockDuration = await timeLockPool.maxLockDuration();
            const maxMultiplier = await timeLockPool.getMultiplier(maxLockDuration);
            const expectedResult5 = theoreticalMultiplier(maxLockDuration, NEW_CURVE)

            const randomDuration = Math.floor(Math.random() * (MAX_LOCK_DURATION - 1)) + 1;
            const randomMultiplier = await timeLockPool.getMultiplier(randomDuration);
            const expectedResult6 = theoreticalMultiplier(randomDuration, NEW_CURVE)

            expect(expectedResult1).to.be.eq(minMultiplier)
            expect(expectedResult2).to.be.eq(oneYearMultiplier)
            expect(expectedResult3).to.be.eq(twoYearMultiplier)
            expect(expectedResult4).to.be.eq(threeYearMultiplier)
            expect(expectedResult5).to.be.eq(maxMultiplier)
            expect(expectedResult6).to.be.eq(randomMultiplier)
        });

        it("Change curve by extending it", async() => {
            const NEW_RAW_CURVE = [
                0,
                0.113450636781733,
                0.23559102796425,
                0.367086765506204,
                0.508654422399196,
                0.661065457561288,
                0.825150419825931,
                1.00180347393553,
                1.19198727320361,
                1.39673820539865,
                1.61717204043653,
                1.85449001065813,
                2.10998535682594,
                2.38505037551144,
                2.6811840062773,
                3,
                3.34323571284532,
                3.71276157381861,
                4.11059127748229,
                4.53889275738489,
                5
            ]
            // Setting a new curve should still work while getting the multiplier
            const NEW_CURVE = NEW_RAW_CURVE.map(function(x) {
                return (x*1e18).toString();
            })
            await timeLockPool.connect(deployer).setCurve(NEW_CURVE);

            const MIN_LOCK_DURATION = await timeLockPool.MIN_LOCK_DURATION();
            const minMultiplier = await timeLockPool.getMultiplier(MIN_LOCK_DURATION);
            const expectedResult1 = theoreticalMultiplier(MIN_LOCK_DURATION, NEW_CURVE)

            const oneYearDuration = MAX_LOCK_DURATION / 4;
            const oneYearMultiplier = await timeLockPool.getMultiplier(oneYearDuration);
            const expectedResult2 = theoreticalMultiplier(oneYearDuration, NEW_CURVE)

            const twoYearDuration = MAX_LOCK_DURATION / 2;
            const twoYearMultiplier = await timeLockPool.getMultiplier(twoYearDuration);
            const expectedResult3 = theoreticalMultiplier(twoYearDuration, NEW_CURVE)

            const threeYearDuration = MAX_LOCK_DURATION * 3 / 4;
            const threeYearMultiplier = await timeLockPool.getMultiplier(threeYearDuration);
            const expectedResult4 = theoreticalMultiplier(threeYearDuration, NEW_CURVE)

            const maxLockDuration = await timeLockPool.maxLockDuration();
            const maxMultiplier = await timeLockPool.getMultiplier(maxLockDuration);
            const expectedResult5 = theoreticalMultiplier(maxLockDuration, NEW_CURVE)

            const randomDuration = Math.floor(Math.random() * (MAX_LOCK_DURATION - 1)) + 1;
            const randomMultiplier = await timeLockPool.getMultiplier(randomDuration);
            const expectedResult6 = theoreticalMultiplier(randomDuration, NEW_CURVE)

            expect(expectedResult1).to.be.eq(minMultiplier)
            expect(expectedResult2).to.be.eq(oneYearMultiplier)
            expect(expectedResult3).to.be.eq(twoYearMultiplier)
            expect(expectedResult4).to.be.eq(threeYearMultiplier)
            expect(expectedResult5).to.be.eq(maxMultiplier)
            expect(expectedResult6).to.be.eq(randomMultiplier)
        });

        it("Change curve by reducing it", async() => {
            // Setting a new curve should still work while getting the multiplier
            const NEW_CURVE = [
                (0*1e18).toString(),
                (5*1e18).toString()
            ]
            await timeLockPool.connect(deployer).setCurve(NEW_CURVE);

            const MIN_LOCK_DURATION = await timeLockPool.MIN_LOCK_DURATION();
            const minMultiplier = await timeLockPool.getMultiplier(MIN_LOCK_DURATION);
            const expectedResult1 = theoreticalMultiplier(MIN_LOCK_DURATION, NEW_CURVE)

            const oneYearDuration = MAX_LOCK_DURATION / 4;
            const oneYearMultiplier = await timeLockPool.getMultiplier(oneYearDuration);
            const expectedResult2 = theoreticalMultiplier(oneYearDuration, NEW_CURVE)

            const twoYearDuration = MAX_LOCK_DURATION / 2;
            const twoYearMultiplier = await timeLockPool.getMultiplier(twoYearDuration);
            const expectedResult3 = theoreticalMultiplier(twoYearDuration, NEW_CURVE)

            const threeYearDuration = MAX_LOCK_DURATION * 3 / 4;
            const threeYearMultiplier = await timeLockPool.getMultiplier(threeYearDuration);
            const expectedResult4 = theoreticalMultiplier(threeYearDuration, NEW_CURVE)

            const maxLockDuration = await timeLockPool.maxLockDuration();
            const maxMultiplier = await timeLockPool.getMultiplier(maxLockDuration);
            const expectedResult5 = theoreticalMultiplier(maxLockDuration, NEW_CURVE)

            const randomDuration = Math.floor(Math.random() * (MAX_LOCK_DURATION - 1)) + 1;
            const randomMultiplier = await timeLockPool.getMultiplier(randomDuration);
            const expectedResult6 = theoreticalMultiplier(randomDuration, NEW_CURVE)

            expect(expectedResult1).to.be.eq(minMultiplier)
            expect(expectedResult2).to.be.eq(oneYearMultiplier)
            expect(expectedResult3).to.be.eq(twoYearMultiplier)
            expect(expectedResult4).to.be.eq(threeYearMultiplier)
            expect(expectedResult5).to.be.eq(maxMultiplier)
            expect(expectedResult6).to.be.eq(randomMultiplier)
        });
    });

    describe("Curve changes: withdawing/increasing/extending", async() => {
        const DEPOSIT_AMOUNT = parseEther("176.378");
        const LOCK_DURATION = MAX_LOCK_DURATION / 4;
        const THREE_MONTHS = MAX_LOCK_DURATION / 12;

        beforeEach(async() => {
            await timeLockPool.deposit(DEPOSIT_AMOUNT, LOCK_DURATION, account1.address);
        });

        it("Withdrawing after curve change should work correctly", async() => {
            // Changing the curve should not affect for withdrawing
            const NEW_CURVE = CURVE.map(function(x) {
                return (hre.ethers.BigNumber.from(x).mul(2).toString())
            })
            await timeLockPool.connect(deployer).setCurve(NEW_CURVE);

            await timeTraveler.increaseTime(MAX_LOCK_DURATION);
            await timeLockPool.withdraw(0, account3.address);

            const timeLockPoolBalance = await timeLockPool.balanceOf(account1.address);
            const totalDeposit = await timeLockPool.getTotalDeposit(account1.address);
            const depositTokenBalance = await depositToken.balanceOf(account3.address);

            expect(timeLockPoolBalance).to.eq(0);
            expect(totalDeposit).to.eq(0);
            expect(depositTokenBalance).to.eq(DEPOSIT_AMOUNT);
        });

        it("Extending lock with a new curve should do it correctly", async() => {
            // First deposit calculated with multiplier from first curve
            // Then curve changes so the multiplier for extension is calculated with new curve
            const NEW_CURVE = CURVE.map(function(x) {
                return (hre.ethers.BigNumber.from(x).mul(2).toString())
            })
            await timeLockPool.connect(deployer).setCurve(NEW_CURVE);

            const startUserDepostit = await timeLockPool.depositsOf(account1.address, 0);
            const startBalance = await timeLockPool.balanceOf(account1.address);

            const nextBlockTimestamp = (startUserDepostit.end.sub(startUserDepostit.start)).div(2).add(startUserDepostit.start).toNumber();

            await timeTraveler.setNextBlockTimestamp(nextBlockTimestamp);

            await timeLockPool.extendLock(0, THREE_MONTHS * 2)

            const endUserDepostit = await timeLockPool.depositsOf(account1.address, 0);
            const endBalance = await timeLockPool.balanceOf(account1.address);

            expect(startBalance).to.be.eq(startUserDepostit.shareAmount)
            expect(endBalance).to.be.eq(endUserDepostit.shareAmount)
            
            const latestBlockTimestamp = (await hre.ethers.provider.getBlock("latest")).timestamp;
            const sixMonthsMultiplier = await timeLockPool.getMultiplier(startUserDepostit.end.sub(latestBlockTimestamp).add(THREE_MONTHS * 2));
            const theoreticalEndShareAmount = DEPOSIT_AMOUNT.mul(sixMonthsMultiplier).div(parseEther("1"));

            expect(theoreticalEndShareAmount).to.be.eq(endUserDepostit.shareAmount).to.be.eq(endBalance);
        });

        it("Extending lock with a significant smaller new curve should burn tokens", async() => {
            // First deposit calculated with multiplier from first curve
            // Then curve changes and multiplier gets smaller, generating a net burn in the tokens
            // Amount * Multiplier1 > Amount * Multiplier2
            const NEW_CURVE = CURVE.map(function(x) {
                return (hre.ethers.BigNumber.from(x).div(10).toString())
            })
            await timeLockPool.connect(deployer).setCurve(NEW_CURVE);
            
            const startUserDepostit = await timeLockPool.depositsOf(account1.address, 0);
            const startBalance = await timeLockPool.balanceOf(account1.address);

            const nextBlockTimestamp = (startUserDepostit.end.sub(startUserDepostit.start)).div(2).add(startUserDepostit.start).toNumber();

            await timeTraveler.setNextBlockTimestamp(nextBlockTimestamp);

            await expect(timeLockPool.extendLock(0, THREE_MONTHS * 2))
                .to.emit(timeLockPool, "Transfer")

            const endUserDepostit = await timeLockPool.depositsOf(account1.address, 0);
            const endBalance = await timeLockPool.balanceOf(account1.address);

            expect(startBalance).to.be.eq(startUserDepostit.shareAmount)
            expect(endBalance).to.be.eq(endUserDepostit.shareAmount)
            
            const latestBlockTimestamp = (await hre.ethers.provider.getBlock("latest")).timestamp;
            const sixMonthsMultiplier = await timeLockPool.getMultiplier(startUserDepostit.end.sub(latestBlockTimestamp).add(THREE_MONTHS * 2));
            const theoreticalEndShareAmount = DEPOSIT_AMOUNT.mul(sixMonthsMultiplier).div(parseEther("1"));

            expect(theoreticalEndShareAmount).to.be.eq(endUserDepostit.shareAmount).to.be.eq(endBalance);
            expect(endBalance).to.be.below(startBalance)
        });
    });

    describe("Batchable", async() => {
        it("User should make multiple deposits on the same transaction", async() => {
            const DEPOSIT_AMOUNT = parseEther("10");
            const calldatas: any[] = [];

            calldatas.push(
                (await timeLockPool.populateTransaction.deposit(DEPOSIT_AMOUNT, constants.MaxUint256, account1.address)).data
            );

            calldatas.push(
                (await timeLockPool.populateTransaction.deposit(DEPOSIT_AMOUNT.mul(2), constants.MaxUint256, account1.address)).data
            );

            calldatas.push(
                (await timeLockPool.populateTransaction.deposit(DEPOSIT_AMOUNT.mul(3), constants.MaxUint256, account1.address)).data
            );

            const depositTokenBalanceBefore = await depositToken.balanceOf(account1.address);

            await timeLockPool.batch(calldatas, true);
            const blockTimestamp = (await hre.ethers.provider.getBlock("latest")).timestamp;

            const depositTokenBalanceAfter = await depositToken.balanceOf(account1.address);

            const deposits = await timeLockPool.getDepositsOf(account1.address);
            const totalDeposit = await timeLockPool.getTotalDeposit(account1.address);
            const timeLockPoolBalance = await timeLockPool.balanceOf(account1.address);
            const multiplier = await timeLockPool.getMultiplier(MAX_LOCK_DURATION);

            expect(deposits[0].amount).to.eq(DEPOSIT_AMOUNT);
            expect(deposits[0].start).to.eq(blockTimestamp);
            expect(deposits[0].end).to.eq(BigNumber.from(blockTimestamp).add(MAX_LOCK_DURATION));

            expect(deposits[1].amount).to.eq(DEPOSIT_AMOUNT.mul(2));
            expect(deposits[1].start).to.eq(blockTimestamp);
            expect(deposits[1].end).to.eq(BigNumber.from(blockTimestamp).add(MAX_LOCK_DURATION));

            expect(deposits[2].amount).to.eq(DEPOSIT_AMOUNT.mul(3));
            expect(deposits[2].start).to.eq(blockTimestamp);
            expect(deposits[2].end).to.eq(BigNumber.from(blockTimestamp).add(MAX_LOCK_DURATION));

            expect(deposits.length).to.eq(3);
            expect(totalDeposit).to.eq(DEPOSIT_AMOUNT.mul(6));
            expect(timeLockPoolBalance).to.eq(DEPOSIT_AMOUNT.mul(6).mul(multiplier).div(constants.WeiPerEther));

            expect(depositTokenBalanceAfter).to.eq(depositTokenBalanceBefore.sub(DEPOSIT_AMOUNT.mul(6)));
        });

        it("User should be able to withdraw and deposit in the same transaction", async() => {
            const DEPOSIT_AMOUNT = parseEther("10");
            const multiplier = await timeLockPool.getMultiplier(MAX_LOCK_DURATION);
            await timeLockPool.deposit(DEPOSIT_AMOUNT, constants.MaxUint256, account1.address);
            const startingDepositBalance = await timeLockPool.balanceOf(account1.address);
            const blockTimestamp1 = (await hre.ethers.provider.getBlock("latest")).timestamp;
            const deposit = await timeLockPool.getDepositsOf(account1.address);
            expect(startingDepositBalance).to.be.eq(DEPOSIT_AMOUNT.mul(multiplier).div(constants.WeiPerEther));
            
            expect(deposit[0].amount).to.eq(DEPOSIT_AMOUNT);
            expect(deposit[0].start).to.eq(blockTimestamp1);
            expect(deposit[0].end).to.eq(BigNumber.from(blockTimestamp1).add(MAX_LOCK_DURATION));
            
            await timeTraveler.increaseTime(MAX_LOCK_DURATION);

            const calldatas: any[] = [];

            calldatas.push(
                (await timeLockPool.populateTransaction.withdraw(0, account1.address)).data
            );

            calldatas.push(
                (await timeLockPool.populateTransaction.deposit(DEPOSIT_AMOUNT.div(2), constants.MaxUint256, account1.address)).data
            );

            calldatas.push(
                (await timeLockPool.populateTransaction.deposit(DEPOSIT_AMOUNT.div(4), MAX_LOCK_DURATION / 2, account1.address)).data
            );

            const depositTokenBalanceBefore = await depositToken.balanceOf(account1.address);

            await timeLockPool.batch(calldatas, true);
            const blockTimestamp2 = (await hre.ethers.provider.getBlock("latest")).timestamp;

            const depositTokenBalanceAfter = await depositToken.balanceOf(account1.address);

            const deposits = await timeLockPool.getDepositsOf(account1.address);
            const totalDeposit = await timeLockPool.getTotalDeposit(account1.address);
            const timeLockPoolBalance = await timeLockPool.balanceOf(account1.address);
            const multiplier1 = await timeLockPool.getMultiplier(MAX_LOCK_DURATION);
            const multiplier2 = await timeLockPool.getMultiplier(MAX_LOCK_DURATION / 2);

            expect(deposits[0].amount).to.eq(DEPOSIT_AMOUNT.div(2));
            expect(deposits[0].start).to.eq(blockTimestamp2);
            expect(deposits[0].end).to.eq(BigNumber.from(blockTimestamp2).add(MAX_LOCK_DURATION));

            expect(deposits[1].amount).to.eq(DEPOSIT_AMOUNT.div(4));
            expect(deposits[1].start).to.eq(blockTimestamp2);
            expect(deposits[1].end).to.eq(BigNumber.from(blockTimestamp2).add(MAX_LOCK_DURATION / 2));

            expect(deposits.length).to.eq(2);
            expect(totalDeposit).to.eq(DEPOSIT_AMOUNT.mul(3).div(4));
            expect(timeLockPoolBalance).to.eq(DEPOSIT_AMOUNT.div(2).mul(multiplier1).div(constants.WeiPerEther).add(DEPOSIT_AMOUNT.div(4).mul(multiplier2).div(constants.WeiPerEther)));

            expect(depositTokenBalanceAfter).to.eq(depositTokenBalanceBefore.sub(DEPOSIT_AMOUNT.div(4).mul(3)).add(DEPOSIT_AMOUNT));
        });

        it("User should be able to increase and extend lock in the same transaction", async() => {
            const startTokenBalance = await depositToken.balanceOf(account1.address);
            const DEPOSIT_AMOUNT = parseEther("10");
            const INCREASE_AMOUNT = DEPOSIT_AMOUNT.div(2);
            await timeLockPool.deposit(DEPOSIT_AMOUNT, MAX_LOCK_DURATION / 4, account1.address);

            const startingDeposit = await timeLockPool.getDepositsOf(account1.address);

            const calldatas: any[] = [];

            calldatas.push(
                (await timeLockPool.populateTransaction.increaseLock(0, account1.address, INCREASE_AMOUNT)).data
            );

            calldatas.push(
                (await timeLockPool.populateTransaction.extendLock(0, MAX_LOCK_DURATION / 2)).data
            );

            await timeTraveler.increaseTime(MAX_LOCK_DURATION / 12);

            await timeLockPool.batch(calldatas, true);
            const blockTimestamp2 = (await hre.ethers.provider.getBlock("latest")).timestamp;
            const deposits = await timeLockPool.getDepositsOf(account1.address);
            const totalDeposit = await timeLockPool.getTotalDeposit(account1.address);
            const balance = await timeLockPool.balanceOf(account1.address);
            const endTokenBalance = await depositToken.balanceOf(account1.address);

            expect(deposits[0].start).to.be.eq(blockTimestamp2);
            expect(deposits[0].end.sub(deposits[0].start)).to.be.eq(startingDeposit[0].end.sub(blockTimestamp2).add(MAX_LOCK_DURATION / 2));

            const multiplier = await timeLockPool.getMultiplier(deposits[0].end.sub(deposits[0].start));
            expect(balance).to.be.eq(DEPOSIT_AMOUNT.add(INCREASE_AMOUNT).mul(multiplier).div(constants.WeiPerEther));
            expect(totalDeposit).to.be.eq(startTokenBalance.sub(endTokenBalance));
        });

        it("Gov should be able to set curve in batches", async() => {
            const calldatas: any[] = [];

            const newPoint1 = (4*1e18).toString();
            const newPoint2 = (9*1e18).toString();
            const newPoint3 = (10*1e18).toString();
            calldatas.push(
                (await timeLockPool.populateTransaction.setCurvePoint(newPoint1, 2)).data
            );

            calldatas.push(
                (await timeLockPool.populateTransaction.setCurvePoint(newPoint2, 5)).data
            );

            calldatas.push(
                (await timeLockPool.populateTransaction.setCurvePoint(newPoint3, 6)).data
            );
            
            await expect(timeLockPool.curve(5)).to.be.reverted;
            await timeLockPool.connect(deployer).batch(calldatas, true);

            const changedCurvePoint1 = await timeLockPool.curve(2);
            const changedCurvePoint2 = await timeLockPool.curve(5);
            const changedCurvePoint3 = await timeLockPool.curve(6);
            expect(changedCurvePoint1).to.be.eq(newPoint1)
            expect(changedCurvePoint2).to.be.eq(newPoint2)
            expect(changedCurvePoint3).to.be.eq(newPoint3)
        });

        it("Should revert after a failed call", async() => {
            const NEW_CURVE = [
                (0*1e18).toString(),
                (5*1e18).toString()
            ]
            await timeLockPool.connect(deployer).setCurve(NEW_CURVE);

            const calldatas: any[] = [];

            const newPoint1 = (4*1e18).toString();
            const newPoint2 = (20*1e18).toString();
            const newPoint3 = (15*1e18).toString();
            
            calldatas.push(
                (await timeLockPool.populateTransaction.setCurvePoint(newPoint1, 6)).data
            );

            calldatas.push(
                (await timeLockPool.populateTransaction.setCurvePoint(newPoint2, 2)).data
            );

            calldatas.push(
                (await timeLockPool.populateTransaction.setCurvePoint(newPoint3, 3)).data
            );

            await expect(timeLockPool.connect(deployer).batch(calldatas, true)).to.be.revertedWith("Transaction reverted silently");
            await expect(timeLockPool.curve(2)).to.be.reverted;
        });

        it("Should not revert after a failed call", async() => {
            const NEW_CURVE = [
                (0*1e18).toString(),
                (5*1e18).toString()
            ]
            await timeLockPool.connect(deployer).setCurve(NEW_CURVE);

            const calldatas: any[] = [];

            const newPoint1 = (4*1e18).toString();
            const newPoint2 = (20*1e18).toString();
            const newPoint3 = (15*1e18).toString();
            
            calldatas.push(
                (await timeLockPool.populateTransaction.setCurvePoint(newPoint1, 6)).data
            );

            calldatas.push(
                (await timeLockPool.populateTransaction.setCurvePoint(newPoint2, 2)).data
            );

            calldatas.push(
                (await timeLockPool.populateTransaction.setCurvePoint(newPoint3, 3)).data
            );

            await expect(timeLockPool.connect(deployer).batch(calldatas, false)).not.to.be.reverted;
        });
    });

    describe("View", async() => {
        it("Should retrieve correct information from a user from one pool", async() => {
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
    });
});