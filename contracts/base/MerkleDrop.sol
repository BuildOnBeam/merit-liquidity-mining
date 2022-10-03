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
    error AlreadyClaimedError();

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
    
    /**
     * @notice Sets the root for claims
     * @param _dropId uint256 id of the drop to be set
     * @param _merkleRoot bytes32 merkle root to be set
     * @param _ipfsHash string ipfs identifier where merkle tree data can be stored
     */
    function setMerkleRoot(
        uint256 _dropId,
        bytes32 _merkleRoot,
        string memory _ipfsHash
    ) external onlyRewardDistributor {
        drops[_dropId].merkleRoot = _merkleRoot;
        emit MerkleRootUpdated(_dropId, _merkleRoot, _ipfsHash);
    }

    /**
     * @notice Returns the root from a given drop
     * @dev This function calculates a multiplier by fetching the points in the curve given a duration.
     * It can achieve this by linearly interpolating between the points of the curve to get a much more
     * precise result. The unit parameter is related to the maximum possible duration of the deposits 
     * and the amount of points in the curve.
     * @param _dropId uint256 id of the drop
     * @return bytes32 merkle root of a specific drop.
     */
    function getMerkleRoot(uint256 _dropId) public view returns (bytes32) {
        return drops[_dropId].merkleRoot;
    }

    /**
     * @notice Drop claiming
     * @dev This functions distributes the drop token to the claimer if the 
     * receiver of the drop has not already claimed and if he provides the proof
     * that he belongs to the merkle tree.
     * @param _dropId uint256 id of the drop to be claimed
     * @param _receiver address receiver of the tokens
     * @param _token address token of the drop
     * @param _amount uint256 amount of the drop
     * @param _proof bytes32[] path of the merkle tree to corroborate the proof
     */
    function claimDrop(
        uint256 _dropId,
        address _receiver,
        address _token,
        uint256 _amount,
        bytes32[] calldata _proof
    ) external {
        Drop storage drop = drops[_dropId];

        // Checks
        if (drop.claims[_receiver] == true) {
            revert AlreadyClaimedError();
        }
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

    /**
     * @notice Send ETH to the contract
     * @dev Only participants with reward distributor role can use this function
     */
    function fundWithETH() external payable onlyRewardDistributor {
        if (msg.value == 0) {
            revert ZeroFundingError();
        }

        emit FundedWithEth(msg.value);
    }

}