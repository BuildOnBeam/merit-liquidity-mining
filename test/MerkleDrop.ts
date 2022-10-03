import { parseEther } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import hre from "hardhat";
import { TestToken, TestToken__factory, MerkleDrop, MerkleDrop__factory } from "../typechain";
import TimeTraveler from "../utils/TimeTraveler";
import DropMerkleTree from "../utils/DropMerkleTree";

import { constants, ethers, utils } from "ethers";

const INITIAL_MINT = parseEther("100000");
//const TOKEN_COUNT = 5;
//const NAME = "NAME";
//const SYMBOL = "SYMBOL";
//const MINT_AMOUNT = parseEther("1000");
const PLACE_HOLDER_IPFSHASH = "🏀🎃🍊";

describe("MerkleDrop", function () {

    let merkleDrop: MerkleDrop;
    let deployer: SignerWithAddress;
    let account1: SignerWithAddress;
    let account2: SignerWithAddress;
    let signers: SignerWithAddress[];
    let token: TestToken;
    let timeTraveler = new TimeTraveler(hre.network.provider);

    before(async() => {
        [
            deployer,
            account1,
            account2,
            ...signers
        ] = await hre.ethers.getSigners();

        merkleDrop = await (new MerkleDrop__factory(deployer)).deploy();

        token = await (new TestToken__factory(deployer)).deploy("TEST", "TEST");
        await token.mint(merkleDrop.address, INITIAL_MINT);

        const REWARD_DISTRIBUTOR_ROLE = await merkleDrop.REWARD_DISTRIBUTOR_ROLE();
        
        await merkleDrop.grantRole(REWARD_DISTRIBUTOR_ROLE, account1.address);
        
        await timeTraveler.snapshot();
    });

    beforeEach(async() => {
        await timeTraveler.revertSnapshot();
    })

    describe("Set merkle root", async() => {
        it("Should let only reward distributors", async() => {
            const newRoot = "0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0";
            await merkleDrop.connect(account1).setMerkleRoot(0, newRoot, PLACE_HOLDER_IPFSHASH);
            const resultMerkleRoot = await merkleDrop.getMerkleRoot(0);
            expect(newRoot).to.be.eq(resultMerkleRoot)
        });

        it("Should set multiple merkle roots", async() => {
            const newRoot = "0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0";
            const newRoot2 = "0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff2";
            
            await merkleDrop.connect(account1).setMerkleRoot(0, newRoot, PLACE_HOLDER_IPFSHASH);
            await merkleDrop.connect(account1).setMerkleRoot(1, newRoot2, PLACE_HOLDER_IPFSHASH);

            expect(await merkleDrop.getMerkleRoot(0)).to.eq(newRoot);
            expect(await merkleDrop.getMerkleRoot(1)).to.eq(newRoot2);
        });

        it("Should revert if caller without role role", async() => {
            const newRoot = "0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0";
            await expect(merkleDrop.connect(deployer).setMerkleRoot(0, newRoot, PLACE_HOLDER_IPFSHASH))
            .to.be.revertedWith("NotRewardDistributorError()");
        });

        it("Should emit the event", async() => {
            const newRoot = "0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0";
            await expect(merkleDrop.connect(account1).setMerkleRoot(0, newRoot, PLACE_HOLDER_IPFSHASH))
            .to.emit(merkleDrop, "MerkleRootUpdated")
            .withArgs(0, newRoot, PLACE_HOLDER_IPFSHASH);
        });
    });

    describe("fundWithETH", async() => {
        it("Should fund", async() => {
            const dropAmount = 1
            const provider = hre.ethers.provider

            await merkleDrop.connect(account1).fundWithETH({value: dropAmount});
                        
            const ETHbalance = await provider.getBalance(merkleDrop.address);

            expect(ETHbalance).to.be.eq(dropAmount)
        });

        it("Should revert with error", async() => {
            const dropAmount = 0
            
            await expect(merkleDrop.connect(account1).fundWithETH({value: dropAmount}))
            .to.be.revertedWith("ZeroFundingError()")
        });
    });

    describe("claim", async() => {
        it("Should claim ETH correctly and emit event", async() => {
            const dropAmount = 1
            const merkleTree = new DropMerkleTree([
                {
                  address: account1.address,
                  token: constants.AddressZero,
                  amount: dropAmount,
                }
            ]);

            await merkleDrop.connect(account1).setMerkleRoot(0, merkleTree.merkleTree.getRoot(), PLACE_HOLDER_IPFSHASH);
            
            const proof = merkleTree.getProof(account1.address, constants.AddressZero, dropAmount);

            const provider = hre.ethers.provider

            await merkleDrop.connect(account1).fundWithETH({value: dropAmount});
                       
            await expect(merkleDrop.claimDrop(0, account1.address, constants.AddressZero, dropAmount, proof))
            .to.emit(merkleDrop, "TokenClaimed")
            .withArgs(0, account1.address, constants.AddressZero);
                        
            expect(await provider.getBalance(merkleDrop.address)).to.be.eq(0)
        });

        it("Should fail claim because of insuficient ETH balance", async() => {
            const dropAmount = 1
            const merkleTree = new DropMerkleTree([
                {
                  address: account1.address,
                  token: constants.AddressZero,
                  amount: dropAmount,
                }
            ]);

            await merkleDrop.connect(account1).setMerkleRoot(0, merkleTree.merkleTree.getRoot(), PLACE_HOLDER_IPFSHASH);
            
            const proof = merkleTree.getProof(account1.address, constants.AddressZero, dropAmount);
            
            await expect(merkleDrop.claimDrop(0, account1.address, constants.AddressZero, dropAmount, proof))
            .to.be.revertedWith("CallNotSuccessfulError()")
        });

        it("Should claim tokens correctly and emit event", async() => {
            const dropAmount = 100
            const merkleTree = new DropMerkleTree([
                {
                  address: account1.address,
                  token: token.address,
                  amount: dropAmount,
                }
            ]);

            await merkleDrop.connect(account1).setMerkleRoot(0, merkleTree.merkleTree.getRoot(), PLACE_HOLDER_IPFSHASH);
            
            const proof = merkleTree.getProof(account1.address, token.address, dropAmount);

            const contractBalance = await token.balanceOf(merkleDrop.address);

            await expect(merkleDrop.claimDrop(0, account1.address, token.address, dropAmount, proof))
            .to.emit(merkleDrop, "TokenClaimed")
            .withArgs(0, account1.address, token.address);

            expect(await token.balanceOf(account1.address)).to.be.eq(dropAmount)
            expect(await token.balanceOf(merkleDrop.address)).to.be.eq(contractBalance.sub(dropAmount))
        });

        it("Should fail claim because of insuficient token balance", async() => {
            const contractBalance = await token.balanceOf(merkleDrop.address);
            await token.burn(merkleDrop.address, contractBalance);

            const dropAmount = 100
            const merkleTree = new DropMerkleTree([
                {
                  address: account1.address,
                  token: token.address,
                  amount: dropAmount,
                }
            ]);

            await merkleDrop.connect(account1).setMerkleRoot(0, merkleTree.merkleTree.getRoot(), PLACE_HOLDER_IPFSHASH);
            
            const proof = merkleTree.getProof(account1.address, token.address, dropAmount);
            
            await expect(merkleDrop.claimDrop(0, account1.address, token.address, dropAmount, proof))
            .to.be.revertedWith("ERC20: transfer amount exceeds balance")
        });

        it("Should claims token correctly and emit event for each claim", async() => {
            const dropAmount = 100
            const merkleTree = new DropMerkleTree([
                {
                    address: account1.address,
                    token: token.address,
                    amount: dropAmount,
                },
                {
                    address: account2.address,
                    token: token.address,
                    amount: dropAmount*2,
                }
            ]);

            await merkleDrop.connect(account1).setMerkleRoot(0, merkleTree.merkleTree.getRoot(), PLACE_HOLDER_IPFSHASH);
            
            const proof = merkleTree.getProof(account1.address, token.address, dropAmount);
            const proof2 = merkleTree.getProof(account2.address, token.address, dropAmount*2);

            const contractBalance = await token.balanceOf(merkleDrop.address);

            await merkleDrop.claimDrop(0, account1.address, token.address, dropAmount, proof)
            await merkleDrop.claimDrop(0, account2.address, token.address, dropAmount*2, proof2)

            expect(await token.balanceOf(account1.address)).to.be.eq(dropAmount)
            expect(await token.balanceOf(account2.address)).to.be.eq(dropAmount*2)
            expect(await token.balanceOf(merkleDrop.address)).to.be.eq(contractBalance.sub(dropAmount*3))
        });

        it("Should fail if already claimed", async() => {
            const dropAmount = 100
            const merkleTree = new DropMerkleTree([
                {
                  address: account1.address,
                  token: token.address,
                  amount: dropAmount,
                }
            ]);

            await merkleDrop.connect(account1).setMerkleRoot(0, merkleTree.merkleTree.getRoot(), PLACE_HOLDER_IPFSHASH);
            
            const proof = merkleTree.getProof(account1.address, token.address, dropAmount);

            const contractBalance = await token.balanceOf(merkleDrop.address);

            await merkleDrop.claimDrop(0, account1.address, token.address, dropAmount, proof)

            await expect(merkleDrop.claimDrop(0, account1.address, token.address, dropAmount, proof))
            .to.be.revertedWith("Already claimed")
        });

        it("Should fail if root is incorrect", async() => {
            const dropAmount = 100
            const merkleTree = new DropMerkleTree([
                {
                  address: account1.address,
                  token: token.address,
                  amount: dropAmount,
                }
            ]);

            const incorrectRoot = "0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0";
            
            await merkleDrop.connect(account1).setMerkleRoot(0, incorrectRoot, PLACE_HOLDER_IPFSHASH);
            
            const proof = merkleTree.getProof(account1.address, token.address, dropAmount);
            
            await expect(merkleDrop.claimDrop(0, account1.address, token.address, dropAmount, proof))
            .to.be.revertedWith("MerkleProofError()")
        });

        it("Should fail if proof is incorrect", async() => {
            const dropAmount = 100
            const merkleTree = new DropMerkleTree([
                {
                  address: account1.address,
                  token: token.address,
                  amount: dropAmount,
                }
            ]);

            await merkleDrop.connect(account1).setMerkleRoot(0, merkleTree.merkleTree.getRoot(), PLACE_HOLDER_IPFSHASH);
            
            const incorrectProof = ["0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0"];
            
            await expect(merkleDrop.claimDrop(0, account1.address, token.address, dropAmount, incorrectProof))
            .to.be.revertedWith("MerkleProofError()")
        });

        it("Should fail if dropIp, receiver, token or amount are incorrect", async() => {
            const dropAmount = 100
            const merkleTree = new DropMerkleTree([
                {
                  address: account1.address,
                  token: token.address,
                  amount: dropAmount,
                }
            ]);

            await merkleDrop.connect(account1).setMerkleRoot(0, merkleTree.merkleTree.getRoot(), PLACE_HOLDER_IPFSHASH);
            
            const proof = merkleTree.getProof(account1.address, token.address, dropAmount);
            
            // incorrect dropId
            await expect(merkleDrop.claimDrop(1, account1.address, token.address, dropAmount, proof))
            .to.be.revertedWith("MerkleProofError()")

            // incorrect receiver
            await expect(merkleDrop.claimDrop(0, account2.address, token.address, dropAmount, proof))
            .to.be.revertedWith("MerkleProofError()")

            // incorrect token
            await expect(merkleDrop.claimDrop(0, account1.address, constants.AddressZero, dropAmount, proof))
            .to.be.revertedWith("MerkleProofError()")

            // incorrect dropAmount
            await expect(merkleDrop.claimDrop(0, account1.address, token.address, dropAmount*2, proof))
            .to.be.revertedWith("MerkleProofError()")
        });
    });
})