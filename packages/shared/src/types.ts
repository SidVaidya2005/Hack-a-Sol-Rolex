import type { BUNDLE_VERSION, PUBLIC_SIGNALS } from "./constants.ts";

export type Address = `0x${string}`;
export type Hex32 = `0x${string}`;
/** A non-negative integer as a decimal string, used for bigint values in JSON. */
export type DecimalString = string;
export type Base64 = string;

export type PublicSignalName = (typeof PUBLIC_SIGNALS)[number];
export type PublicSignals = readonly [
  claimAmount: DecimalString,
  policyCommitment: DecimalString,
  nullifier: DecimalString,
  hospitalRoot: DecimalString,
  claimDay: DecimalString,
  payoutAddress: DecimalString,
];

export interface EddsaPublicKey {
  Ax: DecimalString;
  Ay: DecimalString;
}

export interface EddsaSignature {
  R8x: DecimalString;
  R8y: DecimalString;
  S: DecimalString;
}

/** `pathIndices[i]` is 0 when the current node is the left child, 1 when right. */
export interface MerklePath {
  pathElements: DecimalString[];
  pathIndices: (0 | 1)[];
}

/** Sent only from the insurer to the patient. */
export interface PolicyTerms {
  patientAx: DecimalString;
  patientAy: DecimalString;
  expiryDay: DecimalString;
  perClaimLimit: DecimalString;
  coveredRoot: DecimalString;
  policySalt: DecimalString;
  coveredProcedures: DecimalString[];
}

/** What the hospital receives: no full coverage list. */
export type ApprovedPolicyTerms = Omit<PolicyTerms, "coveredProcedures">;

export interface ClaimRequestBody {
  encounterId: DecimalString;
  procedureCode: DecimalString;
  claimAmount: DecimalString;
  claimDay: DecimalString;
  payoutAddress: Address;
  hospitalPublicKey: EddsaPublicKey;
  hospitalPath: MerklePath;
  hospitalSignature: EddsaSignature;
}

export interface ClaimApprovalBody {
  encounterId: DecimalString;
  terms: ApprovedPolicyTerms;
  coveredPath: MerklePath;
  patientSignature: EddsaSignature;
}

/** Encrypted before it leaves the browser. L4 never sees this shape. */
export type InboxPlaintext =
  | { type: "policy-terms"; body: PolicyTerms }
  | { type: "claim-request"; body: ClaimRequestBody }
  | { type: "claim-approval"; body: ClaimApprovalBody };

/** The only inbox fields visible to L4. */
export interface InboxEnvelope {
  messageId: string;
  sender: Address;
  recipient: Address;
  createdAt: number;
  ephemeralPublicKey: Base64;
  iv: Base64;
  ciphertext: Base64;
}

export type InboxAction = "send" | "list" | "ack";

export interface InboxAuth {
  action: InboxAction;
  wallet: Address;
  nonce: Hex32;
  expiresAt: number;
  ciphertextHash?: Hex32;
  signature: EddsaSignature;
}

export interface WrappedRecordKey {
  reader: Address;
  ephemeralPublicKey: Base64;
  salt: Base64;
  iv: Base64;
  wrappedKey: Base64;
}

/** The on-chain bundle hash is keccak256 of the exact pinned JSON bytes. */
export interface EncryptedBundle {
  version: typeof BUNDLE_VERSION;
  recordId: Hex32;
  iv: Base64;
  ciphertext: Base64;
  wrappedKeys: WrappedRecordKey[];
}

/** Input names for snarkjs and circom_tester. Must match `Claim` exactly. */
export interface ClaimCircuitInput {
  claimAmount: DecimalString;
  policyCommitment: DecimalString;
  nullifier: DecimalString;
  hospitalRoot: DecimalString;
  claimDay: DecimalString;
  payoutAddress: DecimalString;
  procedureCode: DecimalString;
  encounterId: DecimalString;
  policySalt: DecimalString;
  expiryDay: DecimalString;
  perClaimLimit: DecimalString;
  coveredRoot: DecimalString;
  coveredPathElements: DecimalString[];
  coveredPathIndices: (0 | 1)[];
  patientAx: DecimalString;
  patientAy: DecimalString;
  patientS: DecimalString;
  patientR8x: DecimalString;
  patientR8y: DecimalString;
  hospitalAx: DecimalString;
  hospitalAy: DecimalString;
  hospitalS: DecimalString;
  hospitalR8x: DecimalString;
  hospitalR8y: DecimalString;
  hospitalPathElements: DecimalString[];
  hospitalPathIndices: (0 | 1)[];
}

export interface FhirCoding {
  system: string;
  code: string;
  display: string;
}

export interface FhirConcept {
  coding: FhirCoding[];
  text: string;
}

export interface FhirReference {
  reference: string;
}

export interface FhirPatient {
  resourceType: "Patient";
  id: string;
  name: { text: string }[];
  birthDate: string;
}

export interface FhirCondition {
  resourceType: "Condition";
  id: string;
  subject: FhirReference;
  code: FhirConcept;
}

export interface FhirAllergyIntolerance {
  resourceType: "AllergyIntolerance";
  id: string;
  patient: FhirReference;
  code: FhirConcept;
  criticality: "low" | "high" | "unable-to-assess";
}

export interface FhirMedicationRequest {
  resourceType: "MedicationRequest";
  id: string;
  status: "active" | "completed" | "stopped";
  intent: "order";
  subject: FhirReference;
  medicationCodeableConcept: FhirConcept;
}

export interface FhirObservation {
  resourceType: "Observation";
  id: string;
  status: "final";
  subject: FhirReference;
  code: FhirConcept;
  valueString: string;
}

export interface FhirProcedure {
  resourceType: "Procedure";
  id: string;
  status: "completed";
  subject: FhirReference;
  code: FhirConcept;
  performedDateTime: string;
}

export type FhirResource =
  | FhirPatient
  | FhirCondition
  | FhirAllergyIntolerance
  | FhirMedicationRequest
  | FhirObservation
  | FhirProcedure;

export interface FhirBundle {
  resourceType: "Bundle";
  type: "collection";
  entry: { resource: FhirResource }[];
}
