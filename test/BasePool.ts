import { BigNumber, constants } from "@ethereum-waffle/provider/node_modules/ethers";
import { formatEther, parseEther } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import hre from "hardhat";
import {    
    TestBasePool,
    TestBasePool__factory,
    TestToken,
    TestToken__factory,
    TestTimeLockPool,
    TestTimeLockPool__factory,
    TimeLockNonTransferablePool,
    TimeLockNonTransferablePool__factory
} from "../typechain";
import TimeTraveler from "../utils/TimeTraveler";


const TOKEN_NAME = "Staked Token";
const TOKEN_SYMBOL = "STKN";
const ESCROW_PORTION = parseEther("0.6");
const ESCROW_DURATION = 60 * 60 * 24 * 365; // 1 year
const MAX_BONUS_ESCROW = parseEther("1");
const FLAT_CURVE = [(1e18).toString(), (1e18).toString()];

const INITIAL_MINT = parseEther("1000000000");

describe("BasePool", function () {
    this.timeout(300000000);

    let deployer: SignerWithAddress;
    let account1: SignerWithAddress;
    let account2: SignerWithAddress;
    let account3: SignerWithAddress;
    let account4: SignerWithAddress;
    let signers: SignerWithAddress[];

    let basePool: TestBasePool;
    let escrowPool: TestTimeLockPool;
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

        const testTokenFactory = new TestToken__factory(deployer);

        depositToken = (await testTokenFactory.deploy("DPST", "Deposit Token")).connect(account1);
        rewardToken = (await testTokenFactory.deploy("RWRD", "Reward Token")).connect(account1);

        // mint tokens for testing
        await depositToken.mint(account1.address, INITIAL_MINT);
        await depositToken.mint(account2.address, INITIAL_MINT);

        await rewardToken.mint(account1.address, INITIAL_MINT);
        await rewardToken.mint(account2.address, INITIAL_MINT);

        const testTimeLockPool = new TestTimeLockPool__factory(deployer);
        escrowPool = await testTimeLockPool.deploy(
            "Escrow Pool",
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

        const testBasePoolFactory = new TestBasePool__factory(deployer);    
        basePool = await testBasePoolFactory.deploy(
            TOKEN_NAME,
            TOKEN_SYMBOL,
            depositToken.address,
            rewardToken.address,
            escrowPool.address,
            ESCROW_PORTION,
            ESCROW_DURATION
        );

        // connect account1 to all contracts
        depositToken = depositToken.connect(account1);
        rewardToken = rewardToken.connect(account1);
        escrowPool = escrowPool.connect(account1);
        basePool = basePool.connect(account1);

        await timeTraveler.snapshot();
    });

    beforeEach(async() => {
       await timeTraveler.revertSnapshot(); 
    });

    describe("distributeRewards", async() => {
        const DISTRIBUTION_AMOUNT = parseEther("100");
        const BASE_POOL_MINT_AMOUNT = parseEther("1337");
        let pointsMultiplier: BigNumber;

        before(async() => {
            pointsMultiplier = await basePool.POINTS_MULTIPLIER();
        });

        beforeEach(async() => {
            await rewardToken.approve(basePool.address, constants.MaxUint256);
        });

        it("Should fail when there are no shares", async() => {
            await expect(basePool.distributeRewards(DISTRIBUTION_AMOUNT)).to.be.revertedWith("ZeroShareSupplyError()");
        });

        it("Should fail when tokens are not approved", async() => {
            await rewardToken.approve(basePool.address, 0);
            await basePool.mint(account1.address, BASE_POOL_MINT_AMOUNT);
            await expect(basePool.distributeRewards(DISTRIBUTION_AMOUNT)).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
        });

        it("Should work", async() => {
            await basePool.mint(account1.address, BASE_POOL_MINT_AMOUNT);

            const pointsPerShareBefore = await basePool.pointsPerShare();
            const rewardTokenBalanceBefore = await rewardToken.balanceOf(basePool.address);
            await basePool.distributeRewards(DISTRIBUTION_AMOUNT);
            const rewardTokenBalanceAfter = await rewardToken.balanceOf(basePool.address);
            const pointsPerShareAfter = await basePool.pointsPerShare();

            expect(rewardTokenBalanceAfter).to.eq(rewardTokenBalanceBefore.add(DISTRIBUTION_AMOUNT));
            expect(pointsPerShareAfter).to.eq(pointsPerShareBefore.add( DISTRIBUTION_AMOUNT.mul(pointsMultiplier).div(BASE_POOL_MINT_AMOUNT)));
        });
    });
    describe("claimRewards", async() => {
        const DISTRIBUTION_AMOUNT1 = parseEther("100");
        const DISTRIBUTION_AMOUNT2 = parseEther("1834.9");
        const DISTRIBUTION_AMOUNT3 = parseEther("838383.848448");
        const BASE_POOL_MINT_AMOUNT = parseEther("1337");

        let pointsMultiplier: BigNumber;

        before(async() => {
            pointsMultiplier = await basePool.POINTS_MULTIPLIER();
        });

        beforeEach(async() => {
            await rewardToken.approve(basePool.address, constants.MaxUint256);
        });

        it("First claim single holder", async() => {
            await basePool.mint(account1.address, BASE_POOL_MINT_AMOUNT);
            await basePool.distributeRewards(DISTRIBUTION_AMOUNT1);
            
            const account1RewardTokenBalanceBefore = await rewardToken.balanceOf(account1.address);
            const account2RewardTokenBalanceBefore = await rewardToken.balanceOf(account2.address);
            await basePool.claimRewards(account2.address);
            const account1RewardTokenBalanceAfter = await rewardToken.balanceOf(account1.address);
            const account2RewardTokenBalanceAfter = await rewardToken.balanceOf(account2.address);
            const account2EscrowedRewards = await escrowPool.getTotalDeposit(account2.address);
            const account1WithdrawableRewardsAfter = await basePool.withdrawableRewardsOf(account1.address);
            const account1WithdrawnRewardsAfter = await basePool.withdrawnRewardsOf(account1.address);

            const expectedEscrowed = DISTRIBUTION_AMOUNT1.mul(ESCROW_PORTION).div(constants.WeiPerEther);

            expect(account2RewardTokenBalanceAfter).to.eq(account2RewardTokenBalanceBefore.add(DISTRIBUTION_AMOUNT1.sub(expectedEscrowed)));
            expect(account2EscrowedRewards).to.eq(expectedEscrowed.sub(1));
            expect(account1WithdrawableRewardsAfter).to.eq(0);
            expect(account1WithdrawnRewardsAfter).to.eq(DISTRIBUTION_AMOUNT1.sub(1)); // minor integer math rounding error
            expect(account1RewardTokenBalanceAfter).to.eq(account1RewardTokenBalanceBefore);
        });

        it("Claim multiple holders", async() => {
            await basePool.mint(account1.address, BASE_POOL_MINT_AMOUNT);
            await basePool.mint(account2.address, BASE_POOL_MINT_AMOUNT);
            await basePool.distributeRewards(DISTRIBUTION_AMOUNT1);

            await basePool.claimRewards(account3.address);
            await basePool.connect(account2).claimRewards(account4.address);
            const account3RewardTokenBalanceAfter = await rewardToken.balanceOf(account3.address);
            const account4RewardTokenBalanceAfter = await rewardToken.balanceOf(account4.address);
            const account3EscrowedRewards = await escrowPool.getTotalDeposit(account3.address);
            const account4EscrowedRewards = await escrowPool.getTotalDeposit(account4.address);
            const account1WithdrawableRewardsAfter = await basePool.withdrawableRewardsOf(account1.address);
            const account1WithdrawnRewardsAfter = await basePool.withdrawnRewardsOf(account1.address);
            const account2WithdrawableRewardsAfter = await basePool.withdrawableRewardsOf(account2.address);
            const account2WithdrawnRewardsAfter = await basePool.withdrawnRewardsOf(account2.address);
            
            const rewardPerAccount = DISTRIBUTION_AMOUNT1.div("2");
            const expectedEscrowed = rewardPerAccount.mul(ESCROW_PORTION).div(constants.WeiPerEther); // subtract 1

            expect(account3RewardTokenBalanceAfter).to.eq(rewardPerAccount.sub(expectedEscrowed));
            expect(account4RewardTokenBalanceAfter).to.eq(rewardPerAccount.sub(expectedEscrowed));
            expect(account3EscrowedRewards).to.eq(expectedEscrowed.sub(1));
            expect(account4EscrowedRewards).to.eq(expectedEscrowed.sub(1));
            expect(account1WithdrawableRewardsAfter).to.eq(0);
            expect(account1WithdrawnRewardsAfter).to.eq(rewardPerAccount.sub(1));
            expect(account2WithdrawableRewardsAfter).to.eq(0);
            expect(account2WithdrawnRewardsAfter).to.eq(rewardPerAccount.sub(1));
        });
        it("Multiple claims, distribution and holders", async() => {
            await basePool.mint(account1.address, BASE_POOL_MINT_AMOUNT);
            await basePool.distributeRewards(DISTRIBUTION_AMOUNT1);
            await basePool.mint(account2.address, BASE_POOL_MINT_AMOUNT);
            await basePool.distributeRewards(DISTRIBUTION_AMOUNT2);

            // claim and exit account 1
            await basePool.claimRewards(account3.address);
            await basePool.burn(account1.address, BASE_POOL_MINT_AMOUNT);

            // Distribute some more to account 2
            await basePool.distributeRewards(DISTRIBUTION_AMOUNT3);
            await basePool.connect(account2).claimRewards(account4.address);
            await basePool.burn(account2.address, BASE_POOL_MINT_AMOUNT);

            const account1WithdrawnRewards = await basePool.withdrawnRewardsOf(account1.address);
            const account2WithdrawnRewards = await basePool.withdrawnRewardsOf(account2.address);
            const account1WithdrawableRewards = await basePool.withdrawableRewardsOf(account1.address);
            const account2WithdrawableRewards = await basePool.withdrawableRewardsOf(account2.address);
            
            const account3EscrowedRewards = await escrowPool.getTotalDeposit(account3.address);
            const account4EscrowedRewards = await escrowPool.getTotalDeposit(account4.address);
            const account3RewardBalance = await rewardToken.balanceOf(account3.address);
            const account4RewardBalance = await rewardToken.balanceOf(account4.address);

            // Full amount of first distribution, half of second
            const expectedAccount1Rewards = DISTRIBUTION_AMOUNT1.add(DISTRIBUTION_AMOUNT2.div(2));
            // Half of second amount, full amount of third
            const expectedAccount2Rewards = DISTRIBUTION_AMOUNT2.div(2).add(DISTRIBUTION_AMOUNT3);
            // account 3 takes rewards of account1
            const expectedAccount3Escrow = expectedAccount1Rewards.mul(ESCROW_PORTION).div(constants.WeiPerEther);
            const expectedAccount4Escrow = expectedAccount2Rewards.mul(ESCROW_PORTION).div(constants.WeiPerEther);

            expect(account1WithdrawnRewards).to.eq(expectedAccount1Rewards.sub(1)); // subtract one to handle integer math rounding
            expect(account2WithdrawnRewards).to.eq(expectedAccount2Rewards.sub(1)); // subtract one to handle integer math rounding
            expect(account1WithdrawableRewards).to.eq(0);
            expect(account2WithdrawableRewards).to.eq(0);
            expect(account3EscrowedRewards).to.eq(expectedAccount3Escrow.sub(1));
            expect(account4EscrowedRewards).to.eq(expectedAccount4Escrow.sub(1));
            expect(account3RewardBalance).to.eq(expectedAccount1Rewards.sub(account3EscrowedRewards).sub(1));
            expect(account4RewardBalance).to.eq(expectedAccount2Rewards.sub(account4EscrowedRewards).sub(1));
        });

        it("Zero escrow", async() => {
            const testBasePoolFactory = new TestBasePool__factory(deployer);

            const DISTRIBUTION_AMOUNT = parseEther("1");
            const MINT_AMOUNT = parseEther("10");
            
            const tempBasePool = (await testBasePoolFactory.deploy(
                TOKEN_NAME,
                TOKEN_SYMBOL,
                depositToken.address,
                rewardToken.address,
                escrowPool.address,
                0,
                ESCROW_DURATION
            )).connect(account1);

            await rewardToken.approve(tempBasePool.address, constants.MaxUint256);

            await tempBasePool.mint(account1.address, MINT_AMOUNT);
            await tempBasePool.distributeRewards(DISTRIBUTION_AMOUNT);
            await tempBasePool.claimRewards(account3.address);
            
            const account3RewardTokenBalance = await rewardToken.balanceOf(account3.address);
            const account3EscrowedRewards = await escrowPool.getTotalDeposit(account3.address);

            expect(account3RewardTokenBalance).to.eq(DISTRIBUTION_AMOUNT.sub(1));
            expect(account3EscrowedRewards).to.eq(0);
        });

        it("Full escrow", async() => {
            const testBasePoolFactory = new TestBasePool__factory(deployer);

            const DISTRIBUTION_AMOUNT = parseEther("1");
            const MINT_AMOUNT = parseEther("10");
            
            const tempBasePool = (await testBasePoolFactory.deploy(
                TOKEN_NAME,
                TOKEN_SYMBOL,
                depositToken.address,
                rewardToken.address,
                escrowPool.address,
                constants.WeiPerEther,
                ESCROW_DURATION
            )).connect(account1);

            await rewardToken.approve(tempBasePool.address, constants.MaxUint256);

            await tempBasePool.mint(account1.address, MINT_AMOUNT);
            await tempBasePool.distributeRewards(DISTRIBUTION_AMOUNT);
            await tempBasePool.claimRewards(account3.address);
            
            const account3RewardTokenBalance = await rewardToken.balanceOf(account3.address);
            const account3EscrowedRewards = await escrowPool.getTotalDeposit(account3.address);

            expect(account3RewardTokenBalance).to.eq(0);
            expect(account3EscrowedRewards).to.eq(DISTRIBUTION_AMOUNT.sub(1));
        })
    });
});