import { ethers } from "ethers";
import ConstructorView from "../artifacts/contracts/ConstructorView.sol/ConstructorView.json";
import hre from "hardhat";

export const readView = async (user: string, oldPools: string[], newPools: string[]) => {
    const contractBytecode = ConstructorView.bytecode;
    const inputData = ethers.utils.defaultAbiCoder.encode(
        ["address", "address[]", "address[]"],
        [user, oldPools, newPools]
    );
    const calldata = contractBytecode.concat(inputData.slice(2));

    let encodedReturnData: string = "";

    const signers = await hre.ethers.getSigners();

    try {
        // @ts-ignore
        encodedReturnData = await signers[0].provider?.call({ data: calldata });

    } catch(e) {
        console.error(e);
    }
    // console.log(`encoded return data: ${encodedReturnData}`);

    const iface = new ethers.utils.Interface(ConstructorView.abi);
    const decodedReturnData = iface.decodeFunctionResult("fetchBoth", encodedReturnData);
    return decodedReturnData;
};