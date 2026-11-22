pragma circom 2.2.3;

include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/eddsaposeidon.circom";
include "circomlib/circuits/poseidon.circom";

// Computes a Merkle root. Path index 0 means the current node is the left child.
template MerkleRoot(depth) {
    signal input leaf;
    signal input pathElements[depth];
    signal input pathIndices[depth];
    signal output root;

    signal nodes[depth + 1];
    component hashers[depth];

    nodes[0] <== leaf;
    for (var i = 0; i < depth; i++) {
        pathIndices[i] * (pathIndices[i] - 1) === 0; // rule: path-index-binary

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== nodes[i] + pathIndices[i] * (pathElements[i] - nodes[i]);
        hashers[i].inputs[1] <== pathElements[i] + pathIndices[i] * (nodes[i] - pathElements[i]);
        nodes[i + 1] <== hashers[i].out;
    }
    root <== nodes[depth];
}

// Proves a claim meets the private policy rules. The `// rule:` markers let the
// tests confirm that each invalid claim fails at the check it targets.
template Claim(hospitalDepth, coveredDepth) {
    // Public signals: keep these first, in this order, with no outputs (D-029).
    signal input claimAmount;
    signal input policyCommitment;
    signal input nullifier;
    signal input hospitalRoot;
    signal input claimDay;
    signal input payoutAddress;

    signal input procedureCode;
    signal input encounterId;
    signal input policySalt;
    signal input expiryDay;
    signal input perClaimLimit;
    signal input coveredRoot;
    signal input coveredPathElements[coveredDepth];
    signal input coveredPathIndices[coveredDepth];
    signal input patientAx;
    signal input patientAy;
    signal input patientS;
    signal input patientR8x;
    signal input patientR8y;
    signal input hospitalAx;
    signal input hospitalAy;
    signal input hospitalS;
    signal input hospitalR8x;
    signal input hospitalR8y;
    signal input hospitalPathElements[hospitalDepth];
    signal input hospitalPathIndices[hospitalDepth];

    // keccak256("rado/claim/v1") reduced to the BN254 field. A test matches it to @rado/shared.
    var CLAIM_DOMAIN = 2470406988103596035215911638302347985942547529518534802120906646518594990167;
    var DAY_BITS = 32;
    var AMOUNT_BITS = 64;

    // Comparators are unsafe on values wider than their bit size.
    component claimDayBits = Num2Bits(DAY_BITS);
    claimDayBits.in <== claimDay; // rule: claim-day-range
    component expiryDayBits = Num2Bits(DAY_BITS);
    expiryDayBits.in <== expiryDay; // rule: expiry-day-range
    component claimAmountBits = Num2Bits(AMOUNT_BITS);
    claimAmountBits.in <== claimAmount; // rule: claim-amount-range
    component perClaimLimitBits = Num2Bits(AMOUNT_BITS);
    perClaimLimitBits.in <== perClaimLimit; // rule: limit-range

    component hospitalLeaf = Poseidon(2);
    hospitalLeaf.inputs[0] <== hospitalAx;
    hospitalLeaf.inputs[1] <== hospitalAy;

    component hospitalTree = MerkleRoot(hospitalDepth);
    hospitalTree.leaf <== hospitalLeaf.out;
    hospitalTree.pathElements <== hospitalPathElements;
    hospitalTree.pathIndices <== hospitalPathIndices;
    hospitalTree.root === hospitalRoot; // rule: hospital-root

    component coveredLeaf = Poseidon(2);
    coveredLeaf.inputs[0] <== procedureCode;
    coveredLeaf.inputs[1] <== policySalt;

    component coveredTree = MerkleRoot(coveredDepth);
    coveredTree.leaf <== coveredLeaf.out;
    coveredTree.pathElements <== coveredPathElements;
    coveredTree.pathIndices <== coveredPathIndices;
    coveredTree.root === coveredRoot; // rule: covered-root

    component commitment = Poseidon(6);
    commitment.inputs[0] <== patientAx;
    commitment.inputs[1] <== patientAy;
    commitment.inputs[2] <== expiryDay;
    commitment.inputs[3] <== perClaimLimit;
    commitment.inputs[4] <== coveredRoot;
    commitment.inputs[5] <== policySalt;
    commitment.out === policyCommitment; // rule: policy-commitment

    component notExpired = LessThan(DAY_BITS);
    notExpired.in[0] <== claimDay;
    notExpired.in[1] <== expiryDay;
    notExpired.out === 1; // rule: not-expired

    component withinLimit = LessEqThan(AMOUNT_BITS);
    withinLimit.in[0] <== claimAmount;
    withinLimit.in[1] <== perClaimLimit;
    withinLimit.out === 1; // rule: within-limit

    component computedNullifier = Poseidon(2);
    computedNullifier.inputs[0] <== encounterId;
    computedNullifier.inputs[1] <== policySalt;
    computedNullifier.out === nullifier; // rule: nullifier

    component claimHash = Poseidon(7);
    claimHash.inputs[0] <== CLAIM_DOMAIN;
    claimHash.inputs[1] <== policyCommitment;
    claimHash.inputs[2] <== encounterId;
    claimHash.inputs[3] <== procedureCode;
    claimHash.inputs[4] <== claimAmount;
    claimHash.inputs[5] <== claimDay;
    claimHash.inputs[6] <== payoutAddress;

    component hospitalSignature = EdDSAPoseidonVerifier();
    hospitalSignature.enabled <== 1;
    hospitalSignature.Ax <== hospitalAx;
    hospitalSignature.Ay <== hospitalAy;
    hospitalSignature.S <== hospitalS;
    hospitalSignature.R8x <== hospitalR8x;
    hospitalSignature.R8y <== hospitalR8y;
    hospitalSignature.M <== claimHash.out; // rule: hospital-signature

    component patientSignature = EdDSAPoseidonVerifier();
    patientSignature.enabled <== 1;
    patientSignature.Ax <== patientAx;
    patientSignature.Ay <== patientAy;
    patientSignature.S <== patientS;
    patientSignature.R8x <== patientR8x;
    patientSignature.R8y <== patientR8y;
    patientSignature.M <== claimHash.out; // rule: patient-signature
}

component main {public [claimAmount, policyCommitment, nullifier, hospitalRoot, claimDay, payoutAddress]} = Claim(8, 6);
