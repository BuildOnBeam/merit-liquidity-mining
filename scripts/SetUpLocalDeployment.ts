import {
    TestFaucetToken,
    TestFaucetToken__factory,
    TimeLockNonTransferablePool,
    TimeLockNonTransferablePool__factory
} from "../typechain";
import { constants } from "ethers";
import { parseEther } from "@ethersproject/units";
import { ethers } from "hardhat";

const MAX_BONUS_ESCROW = parseEther("0");

const ESCROW_DURATION = 60 * 60 * 24 * 365;

const FLAT_CURVE = [0, 0];

async function deployTokens() {
    const signers = await ethers.getSigners();

    const MCToken: TestFaucetToken = await (new TestFaucetToken__factory(signers[0])).deploy(
        "Merit Circle",
        "MC"
    );
    
    await MCToken.deployed();
    console.log(`MCToken deployed to ${MCToken.address}`);


    const MCETHLPToken: TestFaucetToken = await (new TestFaucetToken__factory(signers[0])).deploy(
        "Uniswap V2",
        "UNI-V2"
    );
    
    await MCETHLPToken.deployed();
    console.log(`MCETHLPToken deployed to ${MCETHLPToken.address}`);

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Deployment of Escrow Pool //////////////////////////////////////////////////////////////////////////
    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    console.log("Deploying escrow pool");
    const EscrowPool: TimeLockNonTransferablePool = await (new TimeLockNonTransferablePool__factory(signers[0]).deploy());
    await EscrowPool.initialize(
        "Escrowed Merit Circle",
        "EMC",
        MCToken.address,
        constants.AddressZero,
        constants.AddressZero,
        0,
        0,
        MAX_BONUS_ESCROW,
        ESCROW_DURATION,
        FLAT_CURVE
    )
    console.log(`Escrow pool deployed to ${EscrowPool.address}`,'\n');
}

deployTokens().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});