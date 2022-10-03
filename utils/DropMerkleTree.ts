import { ethers } from "ethers";
import { MerkleTree } from "./MerkleTree";

export default class DropMerkleTree {
  merkleTree: MerkleTree;

  constructor(entries: { token: string; address: string; amount: number }[]) {
    const hashes = entries.map(({ token, address, amount }) =>
      this.hashEntry(address, token, amount),
    );

    this.merkleTree = new MerkleTree(hashes);
  }

  hashEntry(address: string, token: string, amount: number) {
    return ethers.utils.solidityKeccak256(["address", "address", "uint256"], [address, token, amount]);
  }

  getProof = (address: string, token: string, amount: number) => {
    const hash = this.hashEntry(address, token, amount);

    return this.merkleTree.getProof(hash);
  };
}
