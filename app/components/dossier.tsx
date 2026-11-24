"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useState } from "react";

const CIPHER_GLYPHS = "0123456789abcdef";
const DECRYPT_STEPS = 20;
const DECRYPT_STEP_MS = 30;

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Decorative only. It derives from the visible text and never touches real ciphertext. */
function cipherFrame(text: string, step: number) {
  const revealed = Math.floor((step / DECRYPT_STEPS) * text.length);
  return [...text]
    .map((char, index) => {
      if (index < revealed || char === " ") return char;
      const code = char.charCodeAt(0) * 31 + step * 7 + index * 13;
      return CIPHER_GLYPHS[code % CIPHER_GLYPHS.length];
    })
    .join("");
}

/** Resolves from hex to the real text. Screen readers get the real text immediately. */
export function DecryptText({ text, className = "" }: { text: string; className?: string }) {
  const [step, setStep] = useState(() => (prefersReducedMotion() ? DECRYPT_STEPS : 0));
  const done = step >= DECRYPT_STEPS;

  useEffect(() => {
    if (done) return;
    const timer = setTimeout(() => setStep((value) => value + 1), DECRYPT_STEP_MS);
    return () => clearTimeout(timer);
  }, [done, step]);

  if (done) return <span className={className}>{text}</span>;
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="font-mono">
        {cipherFrame(text, step)}
      </span>
    </span>
  );
}

/** A solid bar with a fixed width, so it reveals nothing about the hidden value. */
export function RedactionBar({
  width = "100%",
  label = "Redacted",
}: {
  width?: string;
  label?: string;
}) {
  return <span aria-label={label} className="redaction-bar" role="img" style={{ width }} />;
}

/** Text whose black bar peels away as it appears. */
export function Peel({ children, index = 0 }: { children: ReactNode; index?: number }) {
  return (
    <span className="peel" style={{ "--peel-delay": `${index * 90}ms` } as CSSProperties}>
      {children}
    </span>
  );
}

const SEAL_POINTS = Array.from({ length: 40 }, (_, index) => {
  const angle = (index / 40) * Math.PI * 2;
  const radius = index % 2 === 0 ? 31 : 28.4;
  return `${(32 + radius * Math.cos(angle)).toFixed(2)},${(32 + radius * Math.sin(angle)).toFixed(2)}`;
}).join(" ");

/** A wax seal. Its number is the record's on-chain key version. */
export function KeySeal({
  version,
  label = "KEY",
  broken = false,
  size = 54,
}: {
  version?: string;
  label?: string;
  broken?: boolean;
  size?: number;
}) {
  return (
    <svg
      aria-label={version ? `Sealed with key version ${version}` : "Sealed"}
      className={`seal ${broken ? "seal-broken" : ""}`}
      height={size}
      role="img"
      viewBox="0 0 64 64"
      width={size}
    >
      <polygon fill="currentColor" points={SEAL_POINTS} />
      <circle cx="32" cy="32" fill="none" r="22.5" stroke="#ffffff" strokeWidth="0.9" />
      <text
        fill="#ffffff"
        fontFamily="var(--font-mono)"
        fontSize="6.4"
        fontWeight="700"
        letterSpacing="1.1"
        textAnchor="middle"
        x="32"
        y="24.5"
      >
        {label}
      </text>
      <text
        fill="#ffffff"
        fontFamily="var(--font-display)"
        fontSize={version ? "20" : "17"}
        textAnchor="middle"
        x="32"
        y="42.5"
      >
        {version ? `v${version}` : "R"}
      </text>
    </svg>
  );
}

const INSURER_FIELDS = [
  ["Name", "68%"],
  ["Date of birth", "38%"],
  ["Blood group", "22%"],
  ["Allergies", "82%"],
  ["Emergency contact", "56%"],
] as const;

/** What the insurer's copy looks like: labels only, every value blacked out. */
export function InsurerBlackout() {
  return (
    <div className="mb-5">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-rado-muted">
        Insurer&apos;s copy
      </p>
      <dl className="grid gap-1.5">
        {INSURER_FIELDS.map(([label, width]) => (
          <div className="grid grid-cols-[8.5rem_1fr] items-center gap-3" key={label}>
            <dt className="text-xs text-rado-slate">{label}</dt>
            <dd className="m-0 leading-none">
              <RedactionBar label={`${label} hidden from insurer`} width={width} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Shows what a share lifts the bars from, and what stays blacked out. */
export function SharePreview({
  shared,
  withheld,
  note,
}: {
  shared: readonly string[];
  withheld: readonly string[];
  note?: string;
}) {
  return (
    <div className="mt-3 grid gap-4 rounded-[10px] bg-rado-stone-wash px-3.5 py-3 text-xs sm:grid-cols-2">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-rado-muted">
          Visible to this reader
        </p>
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {shared.map((item, index) => (
            <li className="text-rado-ink" key={item}>
              <Peel index={index}>{item}</Peel>
            </li>
          ))}
        </ul>
        {note ? <p className="mt-2 leading-5 text-rado-slate">{note}</p> : null}
      </div>
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-rado-muted">
          Stays private
        </p>
        {withheld.length ? (
          <ul className="mt-2 flex flex-wrap gap-1">
            {withheld.map((item) => (
              <li key={item}>
                <span className="redaction-label">{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-rado-slate">Nothing. This wallet can read the whole record.</p>
        )}
      </div>
    </div>
  );
}
