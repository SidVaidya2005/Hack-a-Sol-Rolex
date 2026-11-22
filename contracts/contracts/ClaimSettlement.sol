// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IGroth16Verifier} from "./interfaces/IGroth16Verifier.sol";

/// @notice Verifies a zero-knowledge claim proof and pays the hospital from the insurer pool.
contract ClaimSettlement {
    struct Policy {
        uint64 startDay;
        uint256 totalCap;
        uint256 totalPaid;
        bool registered;
    }

    event PolicyRegistered(uint256 indexed policyCommitment, uint64 startDay, uint256 totalCap);
    event HospitalRootUpdated(uint256 indexed root, uint256[] leaves);
    event ClaimSettled(
        uint256 indexed nullifier,
        uint256 indexed policyCommitment,
        address indexed payoutAddress,
        uint256 claimAmount,
        uint64 claimDay,
        uint256 hospitalRoot
    );

    error ZeroAmount();
    error InvalidPayoutAddress(uint256 value);
    error PolicyAlreadyRegistered(uint256 policyCommitment);
    error UnknownPolicy(uint256 policyCommitment);
    error StaleHospitalRoot(uint256 root);
    error NullifierAlreadyUsed(uint256 nullifier);
    error ClaimBeforePolicyStart(uint64 claimDay, uint64 startDay);
    error ClaimDayInFuture(uint64 claimDay);
    error ClaimTooOld(uint64 claimDay);
    error TotalCapExceeded(uint256 policyCommitment);
    error InvalidProof();
    error NotInsurer(address caller);

    uint64 public constant MAX_CLAIM_AGE_DAYS = 30;

    address private immutable _insurer;
    IGroth16Verifier private immutable _verifier;
    IERC20 private immutable _token;

    uint256 public hospitalRoot;

    mapping(uint256 policyCommitment => Policy) private _policies;
    mapping(uint256 nullifier => bool) private _nullifiers;

    modifier onlyInsurer() {
        if (msg.sender != _insurer) revert NotInsurer(msg.sender);
        _;
    }

    constructor(address insurer_, IGroth16Verifier verifier_, IERC20 token_) {
        if (insurer_ == address(0)) revert NotInsurer(insurer_);
        _insurer = insurer_;
        _verifier = verifier_;
        _token = token_;
    }

    function registerPolicy(uint256 policyCommitment, uint256 totalCap) external onlyInsurer {
        Policy storage policy = _policies[policyCommitment];
        if (policy.registered) revert PolicyAlreadyRegistered(policyCommitment);

        uint64 startDay = uint64(block.timestamp / 1 days);
        policy.startDay = startDay;
        policy.totalCap = totalCap;
        policy.registered = true;
        emit PolicyRegistered(policyCommitment, startDay, totalCap);
    }

    /// @dev Emits every approved leaf so a hospital can rebuild its Merkle path (D-027).
    function updateHospitalRoot(uint256 newRoot, uint256[] calldata leaves) external onlyInsurer {
        hospitalRoot = newRoot;
        emit HospitalRootUpdated(newRoot, leaves);
    }

    /// @dev Signal order: amount, policy, nullifier, root, day, payout. Check order is documented.
    function submitClaim(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[6] calldata publicSignals
    ) external {
        uint256 claimAmount = publicSignals[0];
        uint256 policyCommitment = publicSignals[1];
        uint256 nullifier = publicSignals[2];
        uint256 root = publicSignals[3];
        uint256 claimDay = publicSignals[4];
        uint256 payoutValue = publicSignals[5];

        if (claimAmount == 0) revert ZeroAmount();
        if (payoutValue > type(uint160).max) revert InvalidPayoutAddress(payoutValue);

        Policy storage policy = _policies[policyCommitment];
        if (!policy.registered) revert UnknownPolicy(policyCommitment);
        if (root != hospitalRoot) revert StaleHospitalRoot(root);
        if (_nullifiers[nullifier]) revert NullifierAlreadyUsed(nullifier);

        // Compare as uint256 so an oversized day cannot wrap into the valid range.
        uint256 today = block.timestamp / 1 days;
        if (claimDay < policy.startDay) revert ClaimBeforePolicyStart(_day(claimDay), policy.startDay);
        if (claimDay > today) revert ClaimDayInFuture(_day(claimDay));
        if (today - claimDay > MAX_CLAIM_AGE_DAYS) revert ClaimTooOld(_day(claimDay));

        // Subtract so a very large amount cannot overflow past the cap.
        if (claimAmount > policy.totalCap - policy.totalPaid) revert TotalCapExceeded(policyCommitment);
        if (!_verifier.verifyProof(pA, pB, pC, publicSignals)) revert InvalidProof();

        _nullifiers[nullifier] = true;
        policy.totalPaid += claimAmount;
        address payoutAddress = address(uint160(payoutValue));
        emit ClaimSettled(nullifier, policyCommitment, payoutAddress, claimAmount, uint64(claimDay), root);

        // MockUSD reverts on failure, so an unpaid claim rolls back the state above.
        _token.transfer(payoutAddress, claimAmount);
    }

    function policyOf(
        uint256 policyCommitment
    ) external view returns (uint64 startDay, uint256 totalCap, uint256 totalPaid, bool registered) {
        Policy storage policy = _policies[policyCommitment];
        return (policy.startDay, policy.totalCap, policy.totalPaid, policy.registered);
    }

    function nullifierUsed(uint256 nullifier) external view returns (bool) {
        return _nullifiers[nullifier];
    }

    /// @dev Keeps error data readable when a rejected day does not fit in 64 bits.
    function _day(uint256 value) private pure returns (uint64) {
        return value > type(uint64).max ? type(uint64).max : uint64(value);
    }
}
