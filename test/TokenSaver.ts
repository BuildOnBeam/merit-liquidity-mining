import { parseEther } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import hre from "hardhat";
import { TestToken, TestToken__factory, TokenSaver, TokenSaver__factory } from "../typechain";
import TimeTraveler from "../utils/TimeTraveler";

const INITIAL_MINT = parseEther("100");

describe("TokenSaver", function () {

    let tokenSaver: TokenSaver;
    let deployer: SignerWithAddress;
    let account1: SignerWithAddress;
    let account2: SignerWithAddress;
    let token: TestToken;
    let signers: SignerWithAddress[];
    let timeTraveler = new TimeTraveler(hre.network.provider);

    before(async() => {
        [
            deployer,
            account1,
            account2,
            ...signers
        ] = await hre.ethers.getSigners();

        tokenSaver = await (new TokenSaver__factory(deployer)).deploy();
        token = await (new TestToken__factory(deployer)).deploy("TEST", "TEST");

        await token.mint(tokenSaver.address, INITIAL_MINT);
        await timeTraveler.snapshot();

    });

    beforeEach(async() => {
        await timeTraveler.revertSnapshot();
    })

    describe("saveToken", async() => {
        it("Should fail when called fron non whitelised address", async() => {
            await expect(tokenSaver.saveToken(token.address, account1.address, INITIAL_MINT)).to.be.revertedWith("TokenSaver.onlyTokenSaver: permission denied");
        });
        it("Should work", async() => {
            const TOKEN_SAVER_ROLE = await tokenSaver.TOKEN_SAVER_ROLE();
            await tokenSaver.grantRole(TOKEN_SAVER_ROLE, account1.address);
            await tokenSaver.connect(account1).saveToken(token.address, account1.address, INITIAL_MINT);

            const accountTokenBalance = await token.balanceOf(account1.address);
            const tokenSaverTokenBalance = await token.balanceOf(tokenSaver.address);

            expect(accountTokenBalance).to.eq(INITIAL_MINT);
            expect(tokenSaverTokenBalance).to.eq(0);
        });
    });
})