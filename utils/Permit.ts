import hre from "hardhat";
import { BigNumber, Signature, constants } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { TestPermitToken } from "../typechain";
// based on UNI V3 https://github.com/Uniswap/v3-periphery/blob/main/test/shared/permit.ts

export async function getPermitSignature(
    signer: SignerWithAddress,
    token: TestPermitToken,
    spender: string,
    value: BigNumber = constants.MaxUint256,
    deadline: BigNumber = constants.MaxUint256
  ): Promise<Signature> {
    const [nonce, name, version, chainId] = await Promise.all([
      token.nonces(signer.address),
      token.name(),
      '1',
      signer.getChainId(),
    ])
  
    return hre.ethers.utils.splitSignature(
      await signer._signTypedData(
        {
          name,
          version,
          chainId,
          verifyingContract: token.address,
        },
        {
          Permit: [
            {
              name: 'owner',
              type: 'address',
            },
            {
              name: 'spender',
              type: 'address',
            },
            {
              name: 'value',
              type: 'uint256',
            },
            {
              name: 'nonce',
              type: 'uint256',
            },
            {
              name: 'deadline',
              type: 'uint256',
            },
          ],
        },
        {
          owner: signer.address,
          spender,
          value,
          nonce,
          deadline,
        }
      )
    )
  }