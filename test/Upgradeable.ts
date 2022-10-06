import { parseEther, formatEther } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { SSL_OP_SSLEAY_080_CLIENT_DH_BUG } from "constants";
import { BigNumber, constants, Contract  } from "ethers";
import hre, { ethers } from "hardhat";

import {
    TestToken__factory,
    TimeLockPool__factory,
    TestTimeLockPool__factory,
    TimeLockNonTransferablePool__factory,
    ProxyAdmin__factory,
    TransparentUpgradeableProxy__factory,
    TimeLockNonTransferablePoolV2__factory
} from "../typechain";
import {
    TestToken,
    TimeLockPool,
    TestTimeLockPool,
    TimeLockNonTransferablePool,
    ProxyAdmin,
    TransparentUpgradeableProxy,
    TimeLockNonTransferablePoolV2
} from "../typechain";

import TimeTraveler from "../utils/TimeTraveler";
import * as TimeLockNonTransferablePoolJSON from "../artifacts/contracts/TimeLockNonTransferablePool.sol/TimeLockNonTransferablePool.json";
import * as TimeLockNonTransferablePoolV2JSON from "../artifacts/contracts/test/TimeLockNonTransferablePoolV2.sol/TimeLockNonTransferablePoolV2.json";

const ESCROW_DURATION = 60 * 60 * 24 * 365;
const ESCROW_PORTION = parseEther("0.77");
const MAX_BONUS = parseEther("10"); // Same as max value in the curve
const MAX_BONUS_ESCROW = parseEther("1");
const MAX_LOCK_DURATION = 60 * 60 * 24 * 365 * 4;
const INITIAL_MINT = parseEther("1000000");
const FLAT_CURVE = [(1e18).toString(), (1e18).toString()];
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
    let governance: SignerWithAddress;
    let account1: SignerWithAddress;
    let account2: SignerWithAddress;
    let account3: SignerWithAddress;
    let signers: SignerWithAddress[];

    
    let depositToken: TestToken;
    let rewardToken: TestToken;
    let timeLockNonTransferablePool: Contract;
    let timeLockNonTransferablePoolImplementation: TimeLockNonTransferablePool;
    let escrowPool: TestTimeLockPool;
    let proxyAdmin: ProxyAdmin;
    let proxy: TransparentUpgradeableProxy;
    
    const timeTraveler = new TimeTraveler(hre.network.provider);

    before(async() => {
        [
            deployer,
            governance,
            account1,
            account2,
            account3,
            ...signers
        ] = await hre.ethers.getSigners();

        const testTokenFactory = new TestToken__factory(deployer);

        depositToken = await testTokenFactory.deploy("DPST", "Deposit Token");
        rewardToken = await testTokenFactory.deploy("RWRD", "Reward Token");

        await depositToken.mint(account1.address, INITIAL_MINT);
        await rewardToken.mint(account1.address, INITIAL_MINT);

        // Deploy ProxyAdmin
        const ProxyAdmin = new ProxyAdmin__factory(deployer);
        proxyAdmin = await ProxyAdmin.deploy();

        // Deploy to use its address as input in the initializer parameters of the implementation
        const TestTimeLockPoolFactory = new TestTimeLockPool__factory(deployer);
        escrowPool = await TestTimeLockPoolFactory.deploy(
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

        const timeLockNonTransferablePoolFactory = new TimeLockNonTransferablePool__factory(deployer);
        // Deploy the TimeLockPool implementation
        timeLockNonTransferablePoolImplementation = await timeLockNonTransferablePoolFactory.deploy();

        const initializeParameters = [
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
        ]

        const TimeLockNonTransferablePoolInterface = new hre.ethers.utils.Interface(JSON.stringify(TimeLockNonTransferablePoolJSON.abi))
        // Encode data to call the initialize function in the implementation
        const encoded_data = TimeLockNonTransferablePoolInterface.encodeFunctionData("initialize", initializeParameters);

        // Deploy the proxy linking it to the timeLockNonTransferablePoolImplementation and proxyAdmin
        const Proxy = new TransparentUpgradeableProxy__factory(deployer);
        proxy = await Proxy.deploy(timeLockNonTransferablePoolImplementation.address, proxyAdmin.address, encoded_data);
        
        // Create an interface of the implementation on the proxy so we can send the methods of the implementation
        timeLockNonTransferablePool = new ethers.Contract(proxy.address, JSON.stringify(TimeLockNonTransferablePoolJSON.abi), deployer);

        // Sets GOV_ROLE to governance address
        const GOV_ROLE = await timeLockNonTransferablePool.GOV_ROLE();
        await timeLockNonTransferablePool.grantRole(GOV_ROLE, governance.address);
        await proxyAdmin.transferOwnership(governance.address);

        // connect account1 to all contracts
        timeLockNonTransferablePool = timeLockNonTransferablePool.connect(account1);
        escrowPool = escrowPool.connect(account1);
        depositToken = depositToken.connect(account1);
        rewardToken = rewardToken.connect(account1);
        
        await depositToken.approve(timeLockNonTransferablePool.address, constants.MaxUint256);

        await timeTraveler.snapshot();
    })

    beforeEach(async() => {
        await timeTraveler.revertSnapshot();
    })

    describe("upgradeable", async() => {

        describe("proxyAdmin", async() => {
            it("Should set correctly the proxy admin", async() => {
                const getProxyAdmin = await proxyAdmin.getProxyAdmin(proxy.address);
                expect(getProxyAdmin).to.be.eq(proxyAdmin.address)
            });

            it("Should set correctly the implementation", async() => {
                const getProxyImplementation = await proxyAdmin.getProxyImplementation(proxy.address);
                expect(getProxyImplementation).to.be.eq(timeLockNonTransferablePoolImplementation.address)
            });

            it("Should have governance as owner", async() => {
                const owner = await proxyAdmin.owner();
                expect(owner).to.be.eq(governance.address)
            });

            it("Should have governance as owner", async() => {
                const owner = await proxyAdmin.owner();
                expect(owner).to.be.eq(governance.address)
            });
        });

        describe("upgrade", async() => {
            it("Should set another implementation correctly with it's functions", async() => {
                let timeLockNonTransferablePoolImplementationV2: TimeLockNonTransferablePoolV2;

                const TimeLockNonTransferablePoolV2Factory = new TimeLockNonTransferablePoolV2__factory(deployer);
                timeLockNonTransferablePoolImplementationV2 = await TimeLockNonTransferablePoolV2Factory.deploy();

                await proxyAdmin.connect(governance).upgrade(proxy.address, timeLockNonTransferablePoolImplementationV2.address);

                let timeLockNonTransferablePoolV2: Contract;
                timeLockNonTransferablePoolV2 = new ethers.Contract(proxy.address, JSON.stringify(TimeLockNonTransferablePoolV2JSON.abi), deployer);
                
                // TimeLockPoolV2 has testingUpgrade function that returns 7357 ("TEST").
                const testingUpgrade = await timeLockNonTransferablePoolV2.testingUpgrade();
                expect(7357).to.be.eq(testingUpgrade.toNumber())
            });

            it("Should preserve the deposits in the same slot after upgrade", async() => {
                const DEPOSIT_AMOUNT = parseEther("10");
    
                // Deposit
                await timeLockNonTransferablePool.deposit(DEPOSIT_AMOUNT, constants.MaxUint256, account3.address);
                await timeLockNonTransferablePool.deposit(DEPOSIT_AMOUNT, constants.MaxUint256, account3.address);
                
                // Get deposits before upgrade
                const depositTokenBalanceBefore = await depositToken.balanceOf(account1.address);
                const depositsBefore = await timeLockNonTransferablePool.getDepositsOf(account3.address);
                const totalDepositBefore = await timeLockNonTransferablePool.getTotalDeposit(account3.address);
                const timeLockNonTransferablePoolBalanceBefore = await timeLockNonTransferablePool.balanceOf(account3.address);

                let slot: string[] = new Array;
                for(let i = 0; i < 1000; i++) {
                    slot.push(await hre.ethers.provider.getStorageAt(timeLockNonTransferablePool.address, i))
                }

                // Upgrade
                const timeLockNonTransferablePoolFactoryV2 = new TimeLockNonTransferablePoolV2__factory(deployer);
                let timeLockNonTransferablePoolImplementationV2: TimeLockNonTransferablePoolV2;
                timeLockNonTransferablePoolImplementationV2 = await timeLockNonTransferablePoolFactoryV2.deploy();
    
                await proxyAdmin.connect(governance).upgrade(proxy.address, timeLockNonTransferablePoolImplementationV2.address);
    
                let timeLockNonTransferablePoolV2: Contract;
                timeLockNonTransferablePoolV2 = new ethers.Contract(proxy.address, JSON.stringify(TimeLockNonTransferablePoolV2JSON.abi), deployer);
    
                // Get deposits after upgrade
                const depositTokenBalanceAfter = await depositToken.balanceOf(account1.address);
                const depositsAfter = await timeLockNonTransferablePoolV2.getDepositsOf(account3.address);
                const totalDepositAfter = await timeLockNonTransferablePoolV2.getTotalDeposit(account3.address);
                const timeLockNonTransferablePoolBalanceAfter = await timeLockNonTransferablePoolV2.balanceOf(account3.address);
    
                expect(depositTokenBalanceAfter).to.be.eq(depositTokenBalanceBefore);
                expect(depositsAfter[0].amount).to.be.eq(depositsBefore[0].amount);
                expect(depositsAfter[1].amount).to.be.eq(depositsBefore[1].amount);
                expect(depositsAfter[0].start).to.be.eq(depositsBefore[0].start);
                expect(depositsAfter[1].start).to.be.eq(depositsBefore[1].start);
                expect(depositsAfter[0].end).to.be.eq(depositsBefore[0].end);
                expect(depositsAfter[1].end).to.be.eq(depositsBefore[1].end);
                expect(totalDepositAfter).to.be.eq(totalDepositBefore);
                expect(timeLockNonTransferablePoolBalanceAfter).to.be.eq(timeLockNonTransferablePoolBalanceBefore);

                for(let i = 0; i < 1000; i++) {
                    const slotV2 = await hre.ethers.provider.getStorageAt(timeLockNonTransferablePoolV2.address, i);
                    expect(slot[i]).to.be.eq(slotV2);
                }
            });
    
            it("Should preserve storage when extending", async() => {
                const DEPOSIT_AMOUNT = parseEther("10");
                await timeLockNonTransferablePool.deposit(DEPOSIT_AMOUNT, MAX_LOCK_DURATION / 12, account1.address);
                const startUserDepostit = await timeLockNonTransferablePool.depositsOf(account1.address, 0);
                const nextBlockTimestamp = (startUserDepostit.end.sub(startUserDepostit.start)).div(2).add(startUserDepostit.start).toNumber();
                // Fastforward to half of the deposit time elapsed
                await timeTraveler.setNextBlockTimestamp(nextBlockTimestamp);
                await timeLockNonTransferablePool.extendLock(0, MAX_LOCK_DURATION / 24)
    
                let slot: string[] = new Array;
                for(let i = 0; i < 1000; i++) {
                    slot.push(await hre.ethers.provider.getStorageAt(timeLockNonTransferablePool.address, i))
                }

                // Upgrade
                const timeLockNonTransferablePoolFactoryV2 = new TimeLockNonTransferablePoolV2__factory(deployer);
                let timeLockNonTransferablePoolImplementationV2: TimeLockNonTransferablePoolV2;
                timeLockNonTransferablePoolImplementationV2 = await timeLockNonTransferablePoolFactoryV2.deploy();
                await proxyAdmin.connect(governance).upgrade(proxy.address, timeLockNonTransferablePoolImplementationV2.address);
                let timeLockNonTransferablePoolV2: Contract;
                timeLockNonTransferablePoolV2 = new ethers.Contract(proxy.address, JSON.stringify(TimeLockNonTransferablePoolV2JSON.abi), deployer);
    
                for(let i = 0; i < 1000; i++) {
                    const slotV2 = await hre.ethers.provider.getStorageAt(timeLockNonTransferablePoolV2.address, i);
                    expect(slot[i]).to.be.eq(slotV2);
                }
            });
    
            it("Should preserve storage when changing curve", async() => {
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
                await timeLockNonTransferablePool.connect(governance).setCurve(NEW_CURVE);
                
                let slot: string[] = new Array;
                for(let i = 0; i < 1000; i++) {
                    slot.push(await hre.ethers.provider.getStorageAt(timeLockNonTransferablePool.address, i))
                }

                // Upgrade
                const timeLockNonTransferablePoolFactoryV2 = new TimeLockNonTransferablePoolV2__factory(deployer);
                let timeLockNonTransferablePoolImplementationV2: TimeLockNonTransferablePoolV2;
                timeLockNonTransferablePoolImplementationV2 = await timeLockNonTransferablePoolFactoryV2.deploy();
                await proxyAdmin.connect(governance).upgrade(proxy.address, timeLockNonTransferablePoolImplementationV2.address);
                let timeLockNonTransferablePoolV2: Contract;
                timeLockNonTransferablePoolV2 = new ethers.Contract(proxy.address, JSON.stringify(TimeLockNonTransferablePoolV2JSON.abi), deployer);
                
                for(let i = 0; i < 1000; i++) {
                    const slotV2 = await hre.ethers.provider.getStorageAt(timeLockNonTransferablePoolV2.address, i);
                    expect(slot[i]).to.be.eq(slotV2);
                }
            });

            it("Should find a slot that changed", async() => {
                let slot: string[] = new Array;
                for(let i = 0; i < 2000; i++) {
                    slot.push(await hre.ethers.provider.getStorageAt(timeLockNonTransferablePool.address, i))
                }

                const DEPOSIT_AMOUNT = parseEther("10");
                await timeLockNonTransferablePool.deposit(DEPOSIT_AMOUNT, MAX_LOCK_DURATION / 12, account1.address);
                const startUserDepostit = await timeLockNonTransferablePool.depositsOf(account1.address, 0);
                const nextBlockTimestamp = (startUserDepostit.end.sub(startUserDepostit.start)).div(2).add(startUserDepostit.start).toNumber();
                // Fastforward to half of the deposit time elapsed
                await timeTraveler.setNextBlockTimestamp(nextBlockTimestamp);
                await timeLockNonTransferablePool.extendLock(0, MAX_LOCK_DURATION / 24)
    
                // Upgrade
                const timeLockNonTransferablePoolFactoryV2 = new TimeLockNonTransferablePoolV2__factory(deployer);
                let timeLockNonTransferablePoolImplementationV2: TimeLockNonTransferablePoolV2;
                timeLockNonTransferablePoolImplementationV2 = await timeLockNonTransferablePoolFactoryV2.deploy();
                await proxyAdmin.connect(governance).upgrade(proxy.address, timeLockNonTransferablePoolImplementationV2.address);
                let timeLockNonTransferablePoolV2: Contract;
                timeLockNonTransferablePoolV2 = new ethers.Contract(proxy.address, JSON.stringify(TimeLockNonTransferablePoolV2JSON.abi), deployer);
    
                let differences = 0;
                for(let i = 0; i < 2000; i++) {
                    const slotV2 = await hre.ethers.provider.getStorageAt(timeLockNonTransferablePoolV2.address, i);
                    if(slot[i] != slotV2) {
                        differences += 1;
                    }
                }
                expect(differences).to.be.above(0)
            });

        });
    });

    
   


    
    

});
