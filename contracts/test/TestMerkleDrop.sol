// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "../base/MerkleDrop.sol";

contract TestMerkleDrop is MerkleDrop {

    constructor() {
        initializeTest();
    }
    
    function initializeTest () public initializer {
        __MerkleDrop_init();
    }

}