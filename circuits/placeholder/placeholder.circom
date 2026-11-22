pragma circom 2.2.3;

// PLACEHOLDER: this circuit proves none of the claim rules. Any values pass.
// It exists so W05, W10, and W11 can build before the real circuit is merged.
// Never use it in a rehearsal, final E2E run, or the demo (Invariant 24).
template Placeholder() {
    // Same six public inputs, names, and order as Claim (D-029).
    signal input claimAmount;
    signal input policyCommitment;
    signal input nullifier;
    signal input hospitalRoot;
    signal input claimDay;
    signal input payoutAddress;

    // Quadratic constraints tie each input into the proof.
    signal claimAmountSquare <== claimAmount * claimAmount;
    signal policyCommitmentSquare <== policyCommitment * policyCommitment;
    signal nullifierSquare <== nullifier * nullifier;
    signal hospitalRootSquare <== hospitalRoot * hospitalRoot;
    signal claimDaySquare <== claimDay * claimDay;
    signal payoutAddressSquare <== payoutAddress * payoutAddress;
}

component main {public [claimAmount, policyCommitment, nullifier, hospitalRoot, claimDay, payoutAddress]} = Placeholder();
