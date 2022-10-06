import { parseEther } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, constants, Contract } from "ethers";
import hre, { ethers } from "hardhat";
import {
    TestToken,
    TestToken__factory,
    TimeLockPool,
    TimeLockPool__factory,
    TimeLockNonTransferablePool,
    TimeLockNonTransferablePool__factory,
    TransparentUpgradeableProxy,
    TransparentUpgradeableProxy__factory,
    ProxyAdmin,
    ProxyAdmin__factory,
    } from "../typechain";
import TimeTraveler from "../utils/TimeTraveler";
import * as TimeLockPoolJSON from "../artifacts/contracts/TimeLockPool.sol/TimeLockPool.json";


const ESCROW_DURATION = 60 * 60 * 24 * 365;
const ESCROW_PORTION = parseEther("0.77");
const MAX_BONUS = parseEther("5");
const MAX_LOCK_DURATION = 60 * 60 * 24 * 365 * 4;
const INITIAL_MINT = parseEther("1000000");
const DEPOSIT_AMOUNT = parseEther("1000");
const MAX_BONUS_ESCROW = parseEther("1");
const FLAT_CURVE = [parseEther("1"), parseEther("1")];
const CURVE = [
    (0*1e18).toString(),
    (0.65*1e18).toString(),
    (1.5*1e18).toString(),
    (3*1e18).toString(),
    (5*1e18).toString()
]

describe("TimeLockNonTransferablePool", function () {

    let deployer: SignerWithAddress;
    let account1: SignerWithAddress;
    let account2: SignerWithAddress;
    let account3: SignerWithAddress;
    let account4: SignerWithAddress;
    let signers: SignerWithAddress[];

    let timeLockPool: Contract;
    let timeLockPoolImplementation: TimeLockPool;
    let escrowPool: TimeLockNonTransferablePool;
    let depositToken: TestToken;
    let rewardToken: TestToken;
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

        // Deploy ProxyAdmin
        const ProxyAdmin = new ProxyAdmin__factory(deployer);
        proxyAdmin = await ProxyAdmin.deploy();
        
        const timeLockNonTransferablePoolFactory = new TimeLockNonTransferablePool__factory(deployer);
        
        escrowPool = await timeLockNonTransferablePoolFactory.deploy(
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
            ESCROW_PORTION,
            ESCROW_DURATION,
            MAX_BONUS,
            MAX_LOCK_DURATION,
            CURVE
        ]

        const TimeLockPoolInterface = new hre.ethers.utils.Interface(JSON.stringify(TimeLockPoolJSON.abi))
        console.log(TimeLockPoolJSON.abi);
        // Encode data to call the initialize function in the implementation
        const encoded_data = TimeLockPoolInterface.encodeFunctionData("initialize", initializeParameters);

        // Deploy the proxy linking it to the timeLockPoolImplementation and proxyAdmin
        const Proxy = new TransparentUpgradeableProxy__factory(deployer);
        proxy = await Proxy.deploy(timeLockPoolImplementation.address, proxyAdmin.address, encoded_data);
        
        // Create an interface of the implementation on the proxy so we can send the methods of the implementation
        timeLockPool = new ethers.Contract(proxy.address, JSON.stringify(TimeLockPoolJSON.abi), deployer);

        
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
        
        await expect(escrowPool.transfer(account3.address, DEPOSIT_AMOUNT)).to.be.revertedWith("NON_TRANSFERABLE");
    });

    it("transferFrom", async() => {

        await escrowPool.transferFrom(account1.address, account3.address, DEPOSIT_AMOUNT)

        await expect(escrowPool.transferFrom(account1.address, account3.address, DEPOSIT_AMOUNT)).to.be.revertedWith("NON_TRANSFERABLE");
    });
});