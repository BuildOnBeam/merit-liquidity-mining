import { parseEther, formatEther } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { SSL_OP_SSLEAY_080_CLIENT_DH_BUG } from "constants";
import { BigNumber, constants, Contract  } from "ethers";
import hre, { ethers } from "hardhat";
import { TestToken__factory, TimeLockPool__factory, TimeLockNonTransferablePool__factory } from "../typechain";
import { ProxyAdmin__factory, TransparentUpgradeableProxy__factory, TimeLockPoolV2__factory } from "../typechain";
import { TestToken, TimeLockNonTransferablePool, ProxyAdmin, TransparentUpgradeableProxy, TimeLockPoolV2 } from "../typechain";
import { TimeLockPool } from "../typechain/TimeLockPool";
import TimeTraveler from "../utils/TimeTraveler";
import * as TimeLockPoolJSON from "../artifacts/contracts/TimeLockPool.sol/TimeLockPool.json";
import * as TimeLockPoolV2JSON from "../artifacts/contracts/test/TimeLockPoolV2.sol/TimeLockPoolV2.json";

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
    let timeLockPool: Contract;
    let timeLockPoolImplementation: TimeLockPool;
    let escrowPool: TimeLockNonTransferablePool;
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
        const timeLockPoolNonTransferablePoolFactory = new TimeLockNonTransferablePool__factory(deployer);
        escrowPool = await timeLockPoolNonTransferablePoolFactory.deploy(
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

        const timeLockPoolFactory = new TimeLockPool__factory(deployer);
        // Deploy the TimeLockPool implementation
        timeLockPoolImplementation = await timeLockPoolFactory.deploy();

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

        const TimeLockPoolInterface = new hre.ethers.utils.Interface(JSON.stringify(TimeLockPoolJSON.abi))

        // Encode data to call the initialize function in the implementation
        const encoded_data = TimeLockPoolInterface.encodeFunctionData("initialize", initializeParameters);

        // Deploy the proxy linking it to the timeLockPoolImplementation and proxyAdmin
        const Proxy = new TransparentUpgradeableProxy__factory(deployer);
        proxy = await Proxy.deploy(timeLockPoolImplementation.address, proxyAdmin.address, encoded_data);
        
        // Create an interface of the implementation on the proxy so we can send the methods of the implementation
        timeLockPool = new ethers.Contract(proxy.address, JSON.stringify(TimeLockPoolJSON.abi), deployer);

        // Sets GOV_ROLE to governance address
        const GOV_ROLE = await timeLockPool.GOV_ROLE();
        await timeLockPool.grantRole(GOV_ROLE, governance.address);
        await proxyAdmin.transferOwnership(governance.address);

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

    describe("upgradeable", async() => {

        describe("proxyAdmin", async() => {
            it("Should set correctly the proxy admin", async() => {
                const getProxyAdmin = await proxyAdmin.getProxyAdmin(proxy.address);
                expect(getProxyAdmin).to.be.eq(proxyAdmin.address)
            });

            it("Should set correctly the implementation", async() => {
                const getProxyImplementation = await proxyAdmin.getProxyImplementation(proxy.address);
                expect(getProxyImplementation).to.be.eq(timeLockPoolImplementation.address)
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
                const timeLockPoolFactoryV2 = new TimeLockPoolV2__factory(deployer);
                let timeLockPoolImplementationV2: TimeLockPoolV2;
                timeLockPoolImplementationV2 = await timeLockPoolFactoryV2.deploy();

                await proxyAdmin.connect(governance).upgrade(proxy.address, timeLockPoolImplementationV2.address);

                let timeLockPoolV2: Contract;
                timeLockPoolV2 = new ethers.Contract(proxy.address, JSON.stringify(TimeLockPoolV2JSON.abi), deployer);
                
                // TimeLockPoolV2 has testingUpgrade function that returns 7357 ("TEST").
                const testingUpgrade = await timeLockPoolV2.testingUpgrade();
                expect(7357).to.be.eq(testingUpgrade.toNumber())
            });
        });
    });
});
