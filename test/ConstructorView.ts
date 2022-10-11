import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ConstructorView, ConstructorView__factory, TestToken, TestToken__factory, TimeLockNonTransferablePool, TimeLockNonTransferablePool__factory } from "../typechain";
import hre from "hardhat";
import { parseEther } from "ethers/lib/utils";
import { constants } from "ethers";

const CURVE = [
    (0*1e18).toString(),
    (0.65*1e18).toString(),
    (1.5*1e18).toString(),
    (3*1e18).toString(),
    (5*1e18).toString()
]

const ESCROW_DURATION = 60 * 60 * 24 * 365;
const ESCROW_PORTION = parseEther("0.77");
const MAX_BONUS = parseEther("5");
const MAX_LOCK_DURATION = 60 * 60 * 24 * 365 * 4;
const INITIAL_MINT = parseEther("100000000");
const DEPOSIT_AMOUNT = parseEther("1000");
const MAX_BONUS_ESCROW = parseEther("1");
const FLAT_CURVE = [parseEther("1"), parseEther("1")];



describe.only("ConstructorView", function () {
    this.timeout(300000000);

    let deployer: SignerWithAddress;
    let account1: SignerWithAddress;
    let depositToken: TestToken;
    let rewardToken: TestToken;

    let oldPoolsAddresses: string[] = [];
    let newPools:TimeLockNonTransferablePool[] = [];
    let newPoolsAddresses: string[] = [];
    let escrowPool: TimeLockNonTransferablePool;
    let view: ConstructorView;
    

    before(async function () {
        [deployer, account1] = await hre.ethers.getSigners();

        const testTokenFactory = await new TestToken__factory(deployer);

        depositToken = (await testTokenFactory.deploy("DPST", "Deposit Token")).connect(account1);
        rewardToken = await testTokenFactory.deploy("RWRD", "Reward Token");

        await depositToken.mint(account1.address, INITIAL_MINT);

        
        // Deploy escrow pool
        escrowPool = await new TimeLockNonTransferablePool__factory(deployer).deploy();
        await escrowPool.initialize(
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

        const poolFactory = new TimeLockNonTransferablePool__factory(deployer);

        for(let i = 0; i < 10; i++) {
            const pool = (await poolFactory.deploy()).connect(account1);
            await pool.initialize(
                "Staking Pool",
                "STK",
                depositToken.address,
                rewardToken.address,
                escrowPool.address,
                ESCROW_PORTION,
                ESCROW_DURATION,
                MAX_BONUS,
                MAX_LOCK_DURATION,
                CURVE
            );

            const depositAmount = DEPOSIT_AMOUNT.mul(i+1);
            await depositToken.approve(pool.address, depositAmount);
            await pool.deposit(depositAmount, (i + 1) * 60 * 60 * 24 * 7, account1.address);

            newPools.push(pool);
            newPoolsAddresses.push(pool.address);
        }

        view = (await new ConstructorView__factory(deployer).deploy(account1.address, [], [])).connect(account1);
    });

    it("fetchBoth should work", async() => {
        console.log("getting data");
        // const data = await view.fetchBoth(account1.address, oldPoolsAddresses, newPoolsAddresses);
        const data = await view.fetchData(account1.address, newPoolsAddresses);
        console.log(data);
    });

});