// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @notice The function exported by the snarkjs-generated Groth16Verifier.
interface IGroth16Verifier {
    function verifyProof(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[6] calldata publicSignals
    ) external view returns (bool);
}
