import { parseEther } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, constants } from "ethers";
import hre from "hardhat";
import { LiquidityMiningManager, LiquidityMiningManager__factory, TestToken__factory, TimeLockNonTransferablePool__factory } from "../typechain";
import { TestToken } from "../typechain";
import { TimeLockNonTransferablePool } from "../typechain/TimeLockNonTransferablePool";
import TimeTraveler from "../utils/TimeTraveler";

const POOL_COUNT = 4;
const ESCROW_DURATION = 60 * 60 * 24 * 365;
const ESCROW_PORTION = parseEther("0.6");
const INITIAL_REWARD_MINT = parseEther("1000000");
const FLAT_CURVE = [(1e18).toString(), (1e18).toString()];
const CURVE = [
    (0*1e18).toString(),
    (0.65*1e18).toString(),
    (1.5*1e18).toString(),
    (3*1e18).toString(),
    (5*1e18).toString()
]

describe("LiquidityMiningManager", function () {

    let deployer: SignerWithAddress;
    let rewardSource: SignerWithAddress;
    let account1: SignerWithAddress;
    let account2: SignerWithAddress;
    let account3: SignerWithAddress;
    let account4: SignerWithAddress;
    let signers: SignerWithAddress[];

    let depositToken: TestToken;
    let rewardToken: TestToken;
    const pools: TimeLockNonTransferablePool[] = [];
    let escrowPool: TimeLockNonTransferablePool;
    let liquidityMiningManager: LiquidityMiningManager;

    let timeTraveler = new TimeTraveler(hre.network.provider);

    before(async() => {
        [
            deployer,
            rewardSource,
            account1,
            account2,
            account3,
            account4,
            ...signers
        ] = await hre.ethers.getSigners();
        
        const testTokenFactory = new TestToken__factory(deployer);

        depositToken = await testTokenFactory.deploy("Deposit Token", "DPST");
        rewardToken = await testTokenFactory.deploy("Reward Token", "RWRD");

        const poolFactory = new TimeLockNonTransferablePool__factory(deployer);

        escrowPool = await poolFactory.deploy(
            "EscrowPool",
            "ESCRW",
            rewardToken.address,
            rewardToken.address,
            constants.AddressZero,
            0,
            0,
            0,
            ESCROW_DURATION,
            FLAT_CURVE
        );

        liquidityMiningManager = await (new LiquidityMiningManager__factory(deployer)).deploy(rewardToken.address, rewardSource.address);
        

        // setup rewardSource
        await rewardToken.mint(rewardSource.address, INITIAL_REWARD_MINT);
        await rewardToken.connect(rewardSource).approve(liquidityMiningManager.address, constants.MaxUint256);

        for(let i = 0; i < POOL_COUNT; i ++) {
            pools.push(
                await poolFactory.deploy(
                    `Pool ${i}`,
                    `P${i}`,
                    depositToken.address,
                    rewardToken.address,
                    escrowPool.address,
                    ESCROW_PORTION,
                    ESCROW_DURATION,
                    0,
                    ESCROW_PORTION,
                    CURVE
                )
            );         
        }

        // assign gov role to account1
        const GOV_ROLE = await liquidityMiningManager.GOV_ROLE();
        await liquidityMiningManager.grantRole(GOV_ROLE, account1.address);
        // assign REWARD_DISTRIBUTOR_ROLE
        const REWARD_DISTRIBUTOR_ROLE = await liquidityMiningManager.REWARD_DISTRIBUTOR_ROLE();
        await liquidityMiningManager.grantRole(REWARD_DISTRIBUTOR_ROLE, account1.address);

        // connect account1 to relevant contracts
        liquidityMiningManager = liquidityMiningManager.connect(account1);
        await timeTraveler.snapshot();
    });

    beforeEach(async() => {
        await timeTraveler.revertSnapshot();
    });

    describe("Adding pools", async() => {
        it("Adding a single pool", async() => {
            const WEIGHT = parseEther("1");
            await liquidityMiningManager.addPool(pools[0].address, WEIGHT);

            const contractPools = await liquidityMiningManager.getPools();
            const poolAdded = await liquidityMiningManager.poolAdded(pools[0].address);
            const totalWeight = await liquidityMiningManager.totalWeight()

            expect(contractPools.length).to.eq(1);
            expect(contractPools[0].weight).to.eq(WEIGHT);
            expect(contractPools[0].poolContract).to.eq(pools[0].address);
            expect(poolAdded).to.eq(true);
            expect(totalWeight).to.eq(WEIGHT);
        });

        it("Adding multiple pools", async() => {
            const WEIGHT_0 = parseEther("1");
            const WEIGHT_1 = parseEther("3");

            await liquidityMiningManager.addPool(pools[0].address, WEIGHT_0);
            await liquidityMiningManager.addPool(pools[1].address, WEIGHT_1);

            const contractPools = await liquidityMiningManager.getPools();
            const poolAdded0 = await liquidityMiningManager.poolAdded(pools[0].address);
            const poolAdded1 = await liquidityMiningManager.poolAdded(pools[1].address);
            const totalWeight = await liquidityMiningManager.totalWeight();

            expect(contractPools.length).to.eq(2);
            expect(contractPools[0].weight).to.eq(WEIGHT_0);
            expect(contractPools[0].poolContract).to.eq(pools[0].address);
            expect(contractPools[1].weight).to.eq(WEIGHT_1);
            expect(contractPools[1].poolContract).to.eq(pools[1].address);
            expect(poolAdded0).to.eq(true);
            expect(poolAdded1).to.eq(true);
            expect(totalWeight).to.eq(WEIGHT_0.add(WEIGHT_1));
        })

        it("Adding a pool twice should fail", async() => {
            await liquidityMiningManager.addPool(pools[0].address, 0);
            await expect(liquidityMiningManager.addPool(pools[0].address, 0)).to.be.revertedWith("LiquidityMiningManager.addPool: Pool already added");
        });

        it("Adding a pool from a non gov address should fail", async() => {
            await expect(liquidityMiningManager.connect(account2).addPool(pools[0].address, 0)).to.be.revertedWith("LiquidityMiningManager.onlyGov: permission denied");
        });
    });


    describe("Removing pools", async() => {
        let weights: BigNumber[] = [];
        let poolAddresses: string[] = [];
        let startingTotalWeight: BigNumber;

        beforeEach(async() => {
            weights = [];
            poolAddresses = [];
            startingTotalWeight = BigNumber.from(0);
            let weight = parseEther("1");
            for (const pool of pools) {
                await liquidityMiningManager.addPool(pool.address, weight);

                poolAddresses.push(pool.address);
                weights.push(weight);
                weight = weight.add(parseEther("1"));
            }

            startingTotalWeight = await liquidityMiningManager.totalWeight();
        });

        it("Removing last pool in list", async() => {
            await liquidityMiningManager.removePool(pools.length - 1);

            const contractPools = await liquidityMiningManager.getPools();
            for(let i = 0; i < contractPools.length; i ++) {
                expect(contractPools[i].poolContract).to.eq(poolAddresses[i]);
                expect(contractPools[i].weight).to.eq(weights[i]);

                const poolAdded = await liquidityMiningManager.poolAdded(poolAddresses[i]);
                expect(poolAdded).to.eq(true);
            }

            const poolAdded = await liquidityMiningManager.poolAdded(poolAddresses[poolAddresses.length - 1]);
            const totalWeight = await liquidityMiningManager.totalWeight();
            expect(poolAdded).to.eq(false);
            expect(totalWeight).to.eq(startingTotalWeight.sub(weights[weights.length - 1]));
            expect(contractPools.length).to.eq(pools.length - 1);
        });

        it("Removing a pool in the beginning of the list", async() => {
            await liquidityMiningManager.removePool(0);

            const contractPools = await liquidityMiningManager.getPools();

            const weightsCopy = Array.from(weights);
            weightsCopy[0] = weights[weights.length - 1];
            weightsCopy.pop();
            poolAddresses[0] = poolAddresses[poolAddresses.length - 1];
            poolAddresses.pop();

            for(let i = 0; i < contractPools.length; i ++) {
                expect(contractPools[i].poolContract).to.eq(poolAddresses[i]);
                expect(contractPools[i].weight).to.eq(weightsCopy[i]);
            }

            const totalWeight = await liquidityMiningManager.totalWeight();
            expect(totalWeight).to.eq(startingTotalWeight.sub(weights[0]));
            expect(contractPools.length).to.eq(pools.length - 1);
        });

        it("Removing all pools", async() => {
            // remove all pools
            for (let i = 0; i < pools.length; i ++) {
                // remove pool 0 each time as the array gets reordered
                await liquidityMiningManager.removePool(0);
            }

            for(const pool of pools) {
                const poolAdded = await liquidityMiningManager.poolAdded(pool.address);
                expect(poolAdded).to.eq(false);
            }

            const totalWeight = await liquidityMiningManager.totalWeight();
            const contractPools = await liquidityMiningManager.getPools();
            expect(totalWeight).to.eq(0);
            expect(contractPools.length).to.eq(0);
        })

        it("Removing a pool from a non gov address should fail", async() => {
            await expect(liquidityMiningManager.connect(account2).removePool(0)).to.be.revertedWith("LiquidityMiningManager.onlyGov: permission denied");
        });
    });

    describe("Distributing rewards", async() => {
        beforeEach(async() => {
            let i = 0;
            for (const pool of pools) {
                await liquidityMiningManager.addPool(pool.address, parseEther((i + 1).toString()));
                i ++;
            } 
        });

        it("Distributing rewards from an address which does not have the REWARD_DISTRIBUTOR_ROLE", async() => {
            await expect(liquidityMiningManager.connect(account2.address).distributeRewards()).to.revertedWith("LiquidityMiningManager.onlyRewardDistributor: permission denied");
        });

        it("Distributing zero rewards", async() => {
            await liquidityMiningManager.distributeRewards();
            // @ts-ignore
            const lastBlockTimestamp = (await account1.provider?.getBlock("latest")).timestamp;
            const lastRewardDistribution = await liquidityMiningManager.lastDistribution();
            expect(lastBlockTimestamp).to.eq(lastRewardDistribution);
        })

        it("Should return any excess rewards", async() => {
            const POOL_WEIGHT = parseEther("1");
            const REWARDS_PER_SECOND = parseEther("1");

            // add non contract pool
            await liquidityMiningManager.addPool("0x0000000000000000000000000000000000000001", POOL_WEIGHT);
            const totalWeight = await liquidityMiningManager.totalWeight();
            await liquidityMiningManager.setRewardPerSecond(REWARDS_PER_SECOND);
            
            const rewardSourceBalanceBefore = await rewardToken.balanceOf(rewardSource.address);
            const lastDistributionBefore = await liquidityMiningManager.lastDistribution();
            await liquidityMiningManager.distributeRewards();
            const rewardSourceBalanceAfter = await rewardToken.balanceOf(rewardSource.address);
            const lastDistributionAfter = await liquidityMiningManager.lastDistribution();

            const expectedRewardsDistributed = (lastDistributionAfter.sub(lastDistributionBefore)).mul(REWARDS_PER_SECOND).div(constants.WeiPerEther);
            const expectedRewardsReturned = expectedRewardsDistributed.mul(POOL_WEIGHT).div(totalWeight);

            expect(rewardSourceBalanceAfter).to.eq(rewardSourceBalanceBefore.sub(expectedRewardsDistributed).add(expectedRewardsReturned).add(1));
        })

        it("Should work", async() => {
            const REWARDS_PER_SECOND = parseEther("1");
            // Enable rewards
            await liquidityMiningManager.setRewardPerSecond(REWARDS_PER_SECOND);
            
            const lastDistributionBefore = await liquidityMiningManager.lastDistribution();
            await liquidityMiningManager.distributeRewards();
            const lastDistributionAfter = await liquidityMiningManager.lastDistribution();

            const totalWeight = await liquidityMiningManager.totalWeight();
            const expectedRewardsDistributed = (lastDistributionAfter.sub(lastDistributionBefore)).mul(REWARDS_PER_SECOND).div(constants.WeiPerEther);

            for(let i = 0; i < pools.length; i ++) {
                const poolTokenBalance = await rewardToken.balanceOf(pools[i].address);
                const poolWeight = (await liquidityMiningManager.pools(i)).weight;
                const expectedPoolTokenBalance = expectedRewardsDistributed.mul(poolWeight).div(totalWeight);
                expect(expectedPoolTokenBalance).to.eq(poolTokenBalance);
            }
        });
    });

    describe("Adjusting weight", async() => {
        let weights;
        beforeEach(async() => {
            weights = [];
            let i = 0;
            for (const pool of pools) {
                const weight = parseEther((i + 1).toString());
                weights.push(weight);
                await liquidityMiningManager.addPool(pool.address, weight);
                i ++;
            } 
        })

        it("Adjust weight up", async() => {
            const WEIGHT_INCREMENT = parseEther("1");
            const POOL_ID = 0;
            
            const totalWeightBefore = await liquidityMiningManager.totalWeight();
            const poolBefore = await liquidityMiningManager.pools(POOL_ID);
            await liquidityMiningManager.adjustWeight(POOL_ID, poolBefore.weight.add(WEIGHT_INCREMENT));
            const lastDistribution = await liquidityMiningManager.lastDistribution();
            // @ts-ignore
            const blockTimestamp = (await account1.provider?.getBlock("latest")).timestamp;
            const poolAfter = await liquidityMiningManager.pools(POOL_ID);
            const totalWeightAfter = await liquidityMiningManager.totalWeight();

            expect(lastDistribution).to.eq(blockTimestamp);
            expect(poolAfter.weight).to.eq(poolBefore.weight.add(WEIGHT_INCREMENT));
            expect(totalWeightAfter).to.eq(totalWeightBefore.add(WEIGHT_INCREMENT));
        });

        it("Adjust weight down", async() => {
            const WEIGHT_DECREMENT = parseEther("1");
            const POOL_ID = 0;
            
            const totalWeightBefore = await liquidityMiningManager.totalWeight();
            const poolBefore = await liquidityMiningManager.pools(POOL_ID);
            await liquidityMiningManager.adjustWeight(POOL_ID, poolBefore.weight.sub(WEIGHT_DECREMENT));
            const lastDistribution = await liquidityMiningManager.lastDistribution();
            // @ts-ignore
            const blockTimestamp = (await account1.provider?.getBlock("latest")).timestamp;
            const poolAfter = await liquidityMiningManager.pools(POOL_ID);
            const totalWeightAfter = await liquidityMiningManager.totalWeight();

            expect(lastDistribution).to.eq(blockTimestamp);
            expect(poolAfter.weight).to.eq(poolBefore.weight.sub(WEIGHT_DECREMENT));
            expect(totalWeightAfter).to.eq(totalWeightBefore.sub(WEIGHT_DECREMENT));
        });

        it("Should fail from non gov address", async() => {
            await expect(liquidityMiningManager.connect(account2).adjustWeight(0, 0)).to.be.revertedWith("LiquidityMiningManager.onlyGov: permission denied");
        });

    });

    describe("Setting reward per second", async() => {
        it("Should work", async() => {
            const NEW_REWARD_RATE = parseEther("2");

            await liquidityMiningManager.setRewardPerSecond(NEW_REWARD_RATE);
            const lastDistribution = await liquidityMiningManager.lastDistribution();
            // @ts-ignore
            const blockTimestamp = (await account1.provider?.getBlock("latest")).timestamp;
            const rewardPerSecond = await liquidityMiningManager.rewardPerSecond();

            expect(lastDistribution).to.eq(blockTimestamp);
            expect(rewardPerSecond).to.eq(NEW_REWARD_RATE);
        });

        it("Should fail from non gov address", async() => {
            await expect(liquidityMiningManager.connect(account2).setRewardPerSecond(0)).to.be.revertedWith("LiquidityMiningManager.onlyGov: permission denied");
        });
    });

})