# Privacy-Preserving Health Records and Zero-Knowledge Insurance Claims

## Overview

Enable hospitals to prove that an insurance claim is valid without revealing the
patient's diagnosis or other sensitive medical information. The system should use
zero-knowledge proofs (ZKPs) and smart contracts to protect privacy while
automating claim verification and settlement.

## Background

Electronic health records and insurance claims require continuous data sharing
between patients, hospitals, and insurers. Records are often stored in
centralised silos, giving patients limited control. Claim verification can also
force hospitals to expose diagnoses, prescriptions, and treatment histories to
insurers.

This creates significant privacy risks, as well as slow and
fraud-prone manual settlement processes.

## Problem Statement

Build a working, end-to-end decentralised prototype in which:

- A hospital proves to an insurer that a claim is valid.
- The claim is settled automatically after successful verification.
- The insurer never sees the patient's medical details.
- Patients control who can access their records.

## Must-Have Features

### 1. Zero-Knowledge Claim Verification

Implement a working proof in which the hospital demonstrates, without revealing
the diagnosis, procedure, or prescriptions, that:

- The claim comes from a licensed hospital on an approved list, such as through
  a Merkle-tree membership proof.
- The claim is tied to an active policy whose expiry date is later than the
  claim date.
- The procedure is included in the policy's covered set.
- The claim amount is within the policy limit.

### 2. Smart-Contract Settlement

The smart contract must:

- Verify the zero-knowledge proof.
- Reject duplicate or replayed claims using a unique claim hash or nullifier.
- Release payment automatically when the proof is valid.

### 3. Patient Permissions

- Store records encrypted off-chain using IPFS or encrypted cloud storage.
- Store only record hashes on-chain.
- Allow patients to grant and revoke access for doctors.

### 4. Three-Role Interface

Provide a clean demonstration of the following workflow:

**Patient → Hospital → Insurer**

## Public and Private Inputs

### Public Inputs

The following inputs are visible to the insurer and stored on-chain:

- Claim amount
- Policy commitment
- Claim nullifier
- Approved-hospital list root

### Private Inputs

The following information must never be revealed:

- Diagnosis
- Procedure code
- Prescriptions
- Treatment history
- Patient record contents

## Bonus Features

- Time-bound or role-based access, with every view and change recorded in an
  on-chain audit trail.
- Emergency **break-glass** access for responders when a patient is
  incapacitated, with all access fully logged.
- Lab, pharmacy, or cross-hospital sharing using HL7 FHIR-compatible records.

## Deliverables

- Smart contracts deployed on a local chain or public testnet.
- A working proof-generation and verification flow.
- A front end demonstrating the Patient → Hospital → Insurer workflow.
- An architecture and privacy threat-model diagram showing on-chain and
  off-chain data.
  