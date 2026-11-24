"use client";

import { useEffect, useState } from "react";

import {
  readSavedRole,
  resolveAccountRole,
  saveRole,
  type AccountRole,
  type ChosenRole,
} from "../lib/account-role";
import { KeySeal, Peel, RedactionBar } from "./dossier";
import { Icon, type IconName } from "./icons";
import { ProfileForm } from "./PatientProfilePanel";
import { UnlockGate, useRecordSession } from "./RecordSession";
import { Badge } from "./ui";

const SPECIMEN = [
  ["Diagnosis", "74%"],
  ["Procedure", "52%"],
  ["Prescription", "88%"],
  ["History", "61%"],
] as const;

const PROMISES: { icon: IconName; title: string; detail: string }[] = [
  { icon: "wallet", title: "Wallet identity", detail: "No email or password." },
  { icon: "lock", title: "Encrypted here", detail: "Your details are encrypted in this browser." },
  { icon: "shield", title: "Private claims", detail: "Insurers verify without medical data." },
];

function RadoMark() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-[9px] bg-rado-primary text-rado-on-ink">
        <Icon name="lock" className="size-4" />
      </span>
      <span className="page-title text-[22px] leading-none text-rado-ink">Rado</span>
    </span>
  );
}

export function AccountEntry({ onPublicChain }: { onPublicChain: () => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const signingUp = mode === "signup";

  return (
    <div className="page-fade grid min-h-screen bg-white lg:grid-cols-[1fr_1.03fr]">
      <main className="flex min-h-[640px] flex-col px-6 py-8 sm:px-14 lg:px-20">
        <RadoMark />
        <div className="my-auto w-full max-w-[420px] py-10">
          <h1 className="page-title text-[28px] leading-[1.2] text-rado-ink">
            {signingUp ? "Create your account" : "Welcome back!"}
          </h1>
          <p className="mb-7 mt-2 text-sm leading-6 text-rado-slate">
            {signingUp
              ? "Connect a wallet to create your identity. You will choose your role next."
              : "Connect your wallet to access your records and continue where you left off."}
          </p>
          <div className="entry-gate">
            <UnlockGate
              purpose={
                signingUp
                  ? "Confirm in your wallet to create your secure keys. This costs nothing."
                  : "Confirm in your wallet to access your account securely."
              }
            />
          </div>
          <div className="my-5 flex items-center gap-3 text-xs text-rado-muted">
            <span className="h-px flex-1 bg-rado-line" />
            OR
            <span className="h-px flex-1 bg-rado-line" />
          </div>
          <button
            className="button-pill-outline w-full !bg-white !py-2.5"
            onClick={onPublicChain}
            type="button"
          >
            <Icon name="chain" className="mr-2 size-4" />
            View public chain
          </button>
          <p className="mt-6 text-center text-sm text-rado-slate">
            {signingUp ? "Already have an account? " : "Don't have an account? "}
            <button
              className="entry-link"
              onClick={() => setMode(signingUp ? "signin" : "signup")}
              type="button"
            >
              {signingUp ? "Sign in" : "Sign up"}
            </button>
          </p>
        </div>
        <p className="text-xs text-rado-muted">Research prototype. Not for clinical use.</p>
      </main>
      <section className="surface-dark band-ink flex flex-col justify-between gap-10 p-8 sm:p-12 lg:p-14">
        <div className="max-w-xl pt-2 lg:pt-10">
          <h2 className="page-title text-[36px] leading-[1.14] text-rado-ink sm:text-[46px]">
            Your health records.
            <br />
            <Peel index={3}>Your keys.</Peel>
          </h2>
          <div className="glass-card mt-9 max-w-md p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-rado-slate">What an insurer receives</p>
                <p className="page-title mt-1 text-xl leading-none text-rado-ink">Claim file</p>
              </div>
              <KeySeal size={48} version="1" />
            </div>
            <dl className="mt-4 grid gap-2.5">
              {SPECIMEN.map(([label, width]) => (
                <div className="grid grid-cols-[6.5rem_1fr] items-center gap-3" key={label}>
                  <dt className="text-xs text-rado-slate">{label}</dt>
                  <dd className="m-0 leading-none">
                    <RedactionBar label={`${label} hidden`} width={width} />
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex justify-end">
              <Badge tone="success">Verified · no medical data</Badge>
            </div>
          </div>
        </div>
        <div>
          <div className="flex items-center gap-4">
            <p className="whitespace-nowrap text-[11px] uppercase tracking-[0.12em] text-rado-slate">
              How Rado protects you
            </p>
            <span className="h-px flex-1 bg-rado-line" />
          </div>
          <ul className="mt-5 grid gap-3 sm:grid-cols-3">
            {PROMISES.map(({ icon, title, detail }) => (
              <li key={title}>
                <span className="flex items-center gap-2 text-sm font-medium text-rado-ink">
                  <Icon name={icon} className="size-4" />
                  {title}
                </span>
                <span className="mt-1 block text-xs leading-5 text-rado-slate">{detail}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

/** Reads assigned roles from the chain first, so a saved choice can never override them. */
export function useAccountRole() {
  const { session } = useRecordSession();
  const [state, setState] = useState<{
    address: string;
    role: AccountRole | null;
    failed: boolean;
  } | null>(null);

  useEffect(() => {
    if (!session) return;
    let current = true;
    const { address, service, exchange } = session;
    // Started inside a promise, so any failure reaches the retry screen instead of crashing.
    Promise.resolve()
      .then(() =>
        Promise.all([
          exchange.walletIsInsurer(address),
          service.isResponder(),
          service.listProviders(),
          exchange.hospitalIsApproved(address),
          service.listPatientRecords(),
        ]),
      )
      .then(([isInsurer, isResponder, providers, isApprovedHospital, records]) => {
        if (!current) return;
        const providerKind = providers.find(
          ({ wallet }) => wallet.toLowerCase() === address.toLowerCase(),
        )?.kind;
        const role = resolveAccountRole({
          isInsurer,
          isResponder,
          providerKind,
          isApprovedHospital,
          hasPatientRecords: records.length > 0,
          savedRole: readSavedRole(address),
        });
        setState({ address, role, failed: false });
      })
      .catch(() => {
        if (current) setState({ address, role: null, failed: true });
      });
    return () => {
      current = false;
    };
  }, [session]);

  const own = state?.address === session?.address ? state : null;
  return {
    loading: !own,
    failed: own?.failed ?? false,
    role: own?.role ?? null,
    // A full reload also replaces a session left over from an older version of the page.
    retry: () => window.location.reload(),
    choose: (role: ChosenRole) => {
      if (!session) return;
      saveRole(session.address, role);
      setState({ address: session.address, role, failed: false });
    },
  };
}

const CHOICES: {
  id: ChosenRole | "insurer" | "responder";
  title: string;
  detail: string;
  icon: IconName;
}[] = [
  {
    id: "patient",
    title: "Patient",
    detail: "Hold your records and decide who can read them.",
    icon: "heart",
  },
  {
    id: "hospital",
    title: "Hospital",
    detail: "Apply now. You can file claims after the insurer approves this wallet.",
    icon: "building",
  },
  {
    id: "insurer",
    title: "Insurer",
    detail: "Reserved for the authorized insurer wallet.",
    icon: "shield",
  },
  {
    id: "responder",
    title: "Responder",
    detail: "Reserved for the authorized emergency responder wallet.",
    icon: "asterisk",
  },
];

export function SetupFrame({
  step,
  title,
  description,
  children,
}: {
  step: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="page-fade min-h-screen bg-rado-canvas px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-2xl">
        <RadoMark />
        <p className="mt-10 font-mono text-[11px] uppercase tracking-[0.14em] text-rado-muted">
          {step}
        </p>
        <h1 className="page-title mt-2 text-[30px] leading-[1.15] text-rado-ink sm:text-[36px]">
          {title}
        </h1>
        <p className="mb-8 mt-3 text-[15px] leading-normal text-rado-slate">{description}</p>
        {children}
      </div>
    </div>
  );
}

export function RoleSetup({ onChoose }: { onChoose: (role: ChosenRole) => void }) {
  return (
    <SetupFrame
      step="Step 1 of 2"
      title="How will you use Rado?"
      description="Your role is checked against the chain, so choosing one never grants extra access."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {CHOICES.map(({ id, title, detail, icon }) => {
          const selectable = id === "patient" || id === "hospital";
          return (
            <button
              className="choice-sheet"
              disabled={!selectable}
              key={id}
              onClick={() => {
                if (id === "patient" || id === "hospital") onChoose(id);
              }}
              type="button"
            >
              <span className="page-title flex items-center gap-2 text-lg leading-none text-rado-ink">
                <Icon name={icon} />
                {title}
              </span>
              <span className="mt-2 block text-sm leading-[1.4] text-rado-slate">{detail}</span>
            </button>
          );
        })}
      </div>
    </SetupFrame>
  );
}

export function ProfileSetup({ onDone }: { onDone: () => void }) {
  return (
    <SetupFrame
      step="Step 2 of 2"
      title="Your patient details"
      description="Encrypted in this browser. Hospitals and doctors you approve can read them. The emergency responder can open them only through a logged break-glass. Insurers cannot."
    >
      <ProfileForm onSaved={onDone} />
    </SetupFrame>
  );
}
