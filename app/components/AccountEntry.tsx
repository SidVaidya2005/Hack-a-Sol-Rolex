"use client";

import { useEffect, useState } from "react";

import {
  readSavedRole,
  resolveAccountRole,
  saveRole,
  type AccountRole,
  type ChosenRole,
} from "../lib/account-role";
import { Icon, type IconName } from "./icons";
import { ProfileForm } from "./PatientProfilePanel";
import { UnlockGate, useRecordSession } from "./RecordSession";

const PROMISES = [
  "No email or password. Your wallet is your identity.",
  "Your details are encrypted in this browser.",
  "Insurers verify claims without seeing medical data.",
];

export function AccountEntry({ onPublicChain }: { onPublicChain: () => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const signingUp = mode === "signup";

  return (
    <div className="page-fade grid min-h-screen bg-rado-canvas lg:grid-cols-[1fr_1fr]">
      <section className="surface-dark band-navy flex flex-col justify-between gap-12 p-8 sm:p-12">
        <p className="page-title text-2xl leading-none tracking-[-0.02em] text-rado-ink">rado</p>
        <div className="max-w-lg">
          <h1 className="page-title text-[36px] leading-[1.1] tracking-[-0.02em] text-rado-ink sm:text-[48px]">
            Your health records. Your keys.
          </h1>
          <ul className="mt-8 space-y-3">
            {PROMISES.map((text) => (
              <li className="flex items-start gap-3 text-sm text-rado-slate" key={text}>
                <Icon name="check" className="mt-0.5 size-4" />
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="font-mono text-xs text-rado-muted">
          Research prototype. Not for clinical use.
        </p>
      </section>
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-6 grid grid-cols-2 rounded-full bg-rado-stone-wash p-1">
            {(["signin", "signup"] as const).map((item) => (
              <button
                aria-pressed={mode === item}
                className={`rounded-full px-4 py-2 text-sm ${mode === item ? "bg-rado-ink text-rado-on-ink" : "text-rado-slate"}`}
                key={item}
                onClick={() => setMode(item)}
                type="button"
              >
                {item === "signin" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>
          <h2 className="text-2xl leading-[1.3] text-rado-ink">
            {signingUp ? "Create your Rado account" : "Welcome back"}
          </h2>
          <p className="mb-6 mt-1 text-sm leading-[1.4] text-rado-slate">
            {signingUp
              ? "Connect a wallet to create your identity. You will choose your role next."
              : "Connect the wallet you use with Rado. It opens your workspace."}
          </p>
          <UnlockGate
            purpose={
              signingUp
                ? "Confirm in your wallet to create your secure keys. This costs nothing."
                : "Confirm in your wallet to access your account securely."
            }
          />
          <div className="mt-6 text-sm">
            <button className="text-rado-slate underline" onClick={onPublicChain} type="button">
              View public chain
            </button>
          </div>
        </div>
      </main>
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
        <p className="page-title text-2xl leading-none tracking-[-0.02em] text-rado-ink">rado</p>
        <p className="mt-10 font-mono text-xs uppercase tracking-[0.08em] text-rado-muted">
          {step}
        </p>
        <h1 className="page-title mt-2 text-[32px] leading-[1.1] tracking-[-0.02em] text-rado-ink">
          {title}
        </h1>
        <p className="mb-8 mt-2 text-base leading-normal text-rado-slate">{description}</p>
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
              className={`rounded-lg border border-rado-line p-5 text-left ${selectable ? "hover:border-rado-ink" : "cursor-not-allowed opacity-60"}`}
              disabled={!selectable}
              key={id}
              onClick={() => {
                if (id === "patient" || id === "hospital") onChoose(id);
              }}
              type="button"
            >
              <span className="flex items-center gap-2 text-base text-rado-ink">
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
