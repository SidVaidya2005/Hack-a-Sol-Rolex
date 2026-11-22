// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IGroth16Verifier} from "../interfaces/IGroth16Verifier.sol";

/// @notice TEST ONLY. Deployment and seed code must never reference this contract.
contract MockGroth16Verifier is IGroth16Verifier {
    bool public accept = true;

    function setAccept(bool accept_) external {
        accept = accept_;
    }

    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[6] calldata
    ) external view returns (bool) {
        return accept;
    }
}
