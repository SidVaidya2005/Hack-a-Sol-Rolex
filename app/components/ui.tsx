import type { ReactNode } from "react";

import { Icon, type IconName } from "./icons";

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-rado-muted">{children}</p>
  );
}

/** W10 and W11 change a screen's value here as its data becomes real. */
export type DataMode = "simulated" | "records-live" | "policies-live" | "live";

const DATA_MODE_LABELS: Record<DataMode, string> = {
  simulated: "Simulated",
  "records-live": "Records, claims, and payouts live · Walkthrough simulated",
  "policies-live": "Policies live · Payouts simulated",
  live: "Live",
};

export function DataStatus({ mode }: { mode: DataMode }) {
  return (
    <span
      className={`inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em] ${mode === "live" ? "text-rado-ink" : "text-rado-coral-ink"}`}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-rado-coral" />
      {DATA_MODE_LABELS[mode]}
    </span>
  );
}

export function PageHeading({
  eyebrow,
  title,
  description,
  status,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  status: DataMode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <Eyebrow>{eyebrow}</Eyebrow>
          <DataStatus mode={status} />
        </div>
        <h1 className="page-title mt-3 text-[30px] leading-[1.1] text-rado-ink sm:text-[38px]">
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-normal text-rado-slate">{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Panel({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel-surface pb-6 pt-4 ${className}`}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="page-title text-[20px] leading-[1.2] text-rado-ink">{title}</h2>
          {description ? (
            <p className="mt-1.5 text-[13px] leading-[1.45] text-rado-slate">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Band({
  eyebrow,
  title,
  description,
  action,
  children,
  tone = "green",
  className = "",
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  tone?: "green" | "navy" | "ink";
  className?: string;
}) {
  return (
    <section className={`surface-dark band-${tone} rounded-[18px] p-6 sm:p-8 ${className}`}>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 className="page-title mt-2 text-[26px] leading-[1.15] text-rado-ink">{title}</h2>
          {description ? (
            <p className="mt-2 text-[13px] leading-[1.45] text-rado-slate">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: IconName;
}) {
  return (
    <div className="panel-surface min-w-0 py-3">
      <div className="flex items-center justify-between gap-3 text-rado-muted">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em]">{label}</p>
        <Icon name={icon} className="size-4" />
      </div>
      <p className="mt-5 break-words page-title text-[26px] leading-[1.1] text-rado-ink">{value}</p>
      <p className="mt-2 text-xs text-rado-slate">{detail}</p>
    </div>
  );
}

/** A rubber stamp. Ink weight carries the status, so no screen needs a tinted pill. */
export function Badge({
  children,
  tone = "neutral",
  large = false,
  thud = false,
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "info";
  large?: boolean;
  thud?: boolean;
}) {
  return (
    <span
      className={`stamp stamp-${tone} ${large ? "stamp-large" : ""} ${thud ? "stamp-thud" : ""}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
}: {
  icon: IconName;
  title: string;
  description: string;
}) {
  return (
    <div className="grid min-h-56 place-items-center rounded-[14px] border border-dashed border-rado-line px-5 py-9 text-center">
      <div className="grid justify-items-center">
        <span className="text-rado-muted">
          <Icon name={icon} className="size-6" />
        </span>
        <p className="page-title mt-3 text-base text-rado-ink">{title}</p>
        <p className="mt-1 max-w-xs text-sm leading-6 text-rado-slate">{description}</p>
      </div>
    </div>
  );
}
