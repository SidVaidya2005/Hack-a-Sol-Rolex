"use client";

import { INBOX_POLL_MS } from "@rado/shared";
import type { Address, ClaimApprovalBody, ClaimRequestBody, PolicyTerms } from "@rado/shared";
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import type { ExchangeEvent } from "../lib/claim-exchange";
import { generateClaimProof, type ClaimProof } from "../lib/proof-client";
import { plainRecordError } from "../lib/record-service";
import { useRecordSession } from "./RecordSession";

/*
 * Holds private claim data in React memory only, for the signed-in wallet.
 * Only the Patient and Hospital panels may read it. The Insurer screen must not.
 */

export type IncomingClaim = {
  hospital: Address;
  body: ClaimRequestBody;
  status: "pending" | "approved" | "declined";
};

export type OutgoingClaim = {
  patient: Address;
  body: ClaimRequestBody;
  status: "awaiting" | "approved" | "proving" | "proved";
  approval: ClaimApprovalBody | null;
  proof: ClaimProof | null;
  error: string;
};

type ExchangeData = {
  owner: Address | null;
  terms: PolicyTerms | null;
  incoming: IncomingClaim[];
  outgoing: OutgoingClaim[];
  rejected: string[];
  offline: boolean;
};

type ExchangeValue = ExchangeData & {
  requestClaim: (patient: Address, procedureCode: bigint, claimAmount: bigint) => Promise<void>;
  resendRequest: (encounterId: string) => Promise<void>;
  approveClaim: (encounterId: string) => Promise<void>;
  declineClaim: (encounterId: string) => void;
  proveClaim: (encounterId: string) => Promise<void>;
};

const emptyData = (owner: Address | null): ExchangeData => ({
  owner,
  terms: null,
  incoming: [],
  outgoing: [],
  rejected: [],
  offline: false,
});

function applyEvents(data: ExchangeData, events: ExchangeEvent[]): ExchangeData {
  let next = data;
  for (const event of events) {
    if (event.kind === "terms") {
      next = { ...next, terms: event.terms };
    } else if (event.kind === "request") {
      if (!next.incoming.some(({ body }) => body.encounterId === event.body.encounterId)) {
        next = {
          ...next,
          incoming: [
            { hospital: event.hospital, body: event.body, status: "pending" },
            ...next.incoming,
          ],
        };
      }
    } else if (event.kind === "approval") {
      const id = BigInt(event.body.encounterId).toString();
      next = {
        ...next,
        outgoing: next.outgoing.map((claim) =>
          claim.body.encounterId === id && claim.status === "awaiting"
            ? { ...claim, status: "approved", approval: event.body }
            : claim,
        ),
      };
    } else if (!next.rejected.includes(event.reason)) {
      next = { ...next, rejected: [event.reason, ...next.rejected].slice(0, 4) };
    }
  }
  return next;
}

const ClaimExchangeContext = createContext<ExchangeValue | null>(null);

export function ClaimExchangeProvider({ children }: { children: ReactNode }) {
  const { session } = useRecordSession();
  const owner = session?.address ?? null;
  const [stored, setData] = useState<ExchangeData>(() => emptyData(owner));
  // Private data never carries over to a different wallet or a locked session.
  const data = stored.owner === owner ? stored : emptyData(owner);
  if (stored.owner !== owner) setData(data);

  const update = useCallback(
    (change: (current: ExchangeData) => ExchangeData) =>
      setData((current) => (current.owner === owner ? change(current) : current)),
    [owner],
  );

  useEffect(() => {
    if (!session) return;
    let active = true;
    const poll = () =>
      session.exchange
        .poll()
        .then((events) => {
          if (active) update((current) => ({ ...applyEvents(current, events), offline: false }));
        })
        .catch(() => {
          if (active) update((current) => ({ ...current, offline: true }));
        });
    void poll();
    const timer = setInterval(() => void poll(), INBOX_POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [session, update]);

  const changeOutgoing = useCallback(
    (encounterId: string, change: (claim: OutgoingClaim) => OutgoingClaim) =>
      update((current) => ({
        ...current,
        outgoing: current.outgoing.map((claim) =>
          claim.body.encounterId === encounterId ? change(claim) : claim,
        ),
      })),
    [update],
  );

  const requestClaim = useCallback(
    async (patient: Address, procedureCode: bigint, claimAmount: bigint) => {
      if (!session) return;
      const body = await session.exchange.requestClaim({ patient, procedureCode, claimAmount });
      update((current) => ({
        ...current,
        outgoing: [
          { patient, body, status: "awaiting", approval: null, proof: null, error: "" },
          ...current.outgoing,
        ],
      }));
    },
    [session, update],
  );

  const resendRequest = useCallback(
    async (encounterId: string) => {
      await session?.exchange.resendRequest(encounterId);
    },
    [session],
  );

  const approveClaim = useCallback(
    async (encounterId: string) => {
      const claim = data.incoming.find(({ body }) => body.encounterId === encounterId);
      if (!session || !claim || !data.terms) return;
      await session.exchange.approveClaim(claim.body, claim.hospital, data.terms);
      update((current) => ({
        ...current,
        incoming: current.incoming.map((item) =>
          item.body.encounterId === encounterId ? { ...item, status: "approved" } : item,
        ),
      }));
    },
    [data.incoming, data.terms, session, update],
  );

  const declineClaim = useCallback(
    (encounterId: string) =>
      update((current) => ({
        ...current,
        incoming: current.incoming.map((item) =>
          item.body.encounterId === encounterId ? { ...item, status: "declined" } : item,
        ),
      })),
    [update],
  );

  const proveClaim = useCallback(
    async (encounterId: string) => {
      const claim = data.outgoing.find(({ body }) => body.encounterId === encounterId);
      if (!session || !claim?.approval) return;
      changeOutgoing(encounterId, (item) => ({ ...item, status: "proving", error: "" }));
      try {
        const input = await session.exchange.buildCircuitInput(claim.approval);
        const proof = await generateClaimProof(input);
        changeOutgoing(encounterId, (item) => ({ ...item, status: "proved", proof }));
      } catch (error) {
        const text = error instanceof Error ? plainProofError(error) : "";
        changeOutgoing(encounterId, (item) => ({
          ...item,
          status: "approved",
          error: text || "The proof could not be generated.",
        }));
      }
    },
    [changeOutgoing, data.outgoing, session],
  );

  const value = useMemo(
    () => ({ ...data, requestClaim, resendRequest, approveClaim, declineClaim, proveClaim }),
    [approveClaim, data, declineClaim, proveClaim, requestClaim, resendRequest],
  );

  return <ClaimExchangeContext.Provider value={value}>{children}</ClaimExchangeContext.Provider>;
}

/** Proof errors are written for users. Anything else gets the shared plain message. */
function plainProofError(error: Error): string {
  return /proof|proving|claim|hospital/i.test(error.message)
    ? error.message
    : plainRecordError(error);
}

export function useClaimExchange() {
  const value = useContext(ClaimExchangeContext);
  if (!value) throw new Error("useClaimExchange needs ClaimExchangeProvider");
  return value;
}
