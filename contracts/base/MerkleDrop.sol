// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";


contract MerkleDrop is AccessControlEnumerable {
    using SafeERC20 for IERC20;

    error NotRewardDistributorError();

    bytes32 public constant REWARD_DISTRIBUTOR_ROLE = keccak256("REWARD_DISTRIBUTOR_ROLE");

    modifier onlyRewardDistributor {
        if (!hasRole(REWARD_DISTRIBUTOR_ROLE, _msgSender())) {
            revert NotRewardDistributorError();
        }
        _;
    }

    error MerkleProofError();
    error NotOwnerError();
    error CallNotSuccessfulError();
    error ZeroFundingError();

    event MerkleRootUpdated(uint256 indexed dropId, bytes32 indexed merkleRoot, string indexed ipfsHash);
    event TokenClaimed(uint256 indexed dropId, address indexed receiver, address indexed token);
    event FundedWithEth(uint256 indexed amount);

    struct Drop {
        mapping(address => uint256) reserves;
        // account => claimed
        mapping(address => bool) claims;
        bytes32 merkleRoot;
    }

    mapping(uint256 => Drop) public drops;

    constructor() {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
    }
    
    function setMerkleRoot(
        uint256 _dropId,
        bytes32 _merkleRoot,
        string memory _ipfsHash
    ) external onlyRewardDistributor {
        drops[_dropId].merkleRoot = _merkleRoot;
        emit MerkleRootUpdated(_dropId, _merkleRoot, _ipfsHash);
    }

    function getMerkleRoot(uint256 _dropId) public view returns (bytes32) {
        return drops[_dropId].merkleRoot;
    }

    function claimDrop(
        uint256 _dropId,
        address _receiver,
        address _token,
        uint256 _amount,
        bytes32[] calldata _proof
    ) external {
        Drop storage drop = drops[_dropId];

        // Checks
        require(drop.claims[_receiver] == false, "Already claimed");
        bytes32 leaf = keccak256(abi.encodePacked(_receiver, _token, _amount));
        if (!MerkleProof.verify(_proof, drop.merkleRoot, leaf)) {
            revert MerkleProofError();
        }

        // Effects
        drop.claims[_receiver] = true;

        // Interactions
        // IF ETH
        if (_token == address(0)) {
            // solhint-disable-next-line
            (bool success, ) = payable(_receiver).call{ value: _amount }("");
            if (!success) {
                revert CallNotSuccessfulError();
            }
        } else {
            IERC20(_token).safeTransfer(_receiver, _amount);
        }
        emit TokenClaimed(_dropId, _receiver, _token);
    }

    function fundWithETH() external payable onlyRewardDistributor {
        if (msg.value == 0) {
            revert ZeroFundingError();
        }

        emit FundedWithEth(msg.value);
    }

}