import { parseEther } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, constants } from "ethers";
import hre from "hardhat";
import { TestToken__factory, TimeLockNonTransferablePool__factory } from "../typechain";
import { TestToken } from "../typechain";
import { TimeLockNonTransferablePool } from "../typechain/TimeLockNonTransferablePool";
import TimeTraveler from "../utils/TimeTraveler";


// scripts/create-box.js
async function main() {
  const TLNTP = await hre.ethers.getContractFactory("TimeLockNonTransferablePool");
  const tlntp = await hre.upgrades.deployProxy(TLNTP, [42]);
  await tlntp.deployed();
  console.log("tlntp deployed to:", tlntp.address);
}

main();