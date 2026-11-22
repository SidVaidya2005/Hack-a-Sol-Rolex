import type { ReactNode } from "react";

import { Icon, type IconName } from "./icons";

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="font-mono text-xs uppercase tracking-[0.08em] text-rado-muted">{children}</p>
  );
}

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-10 flex flex-col justify-between gap-6 lg:mb-14 lg:flex-row lg:items-end">
      <div className="min-w-0">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="page-title mt-4 text-[44px] leading-none tracking-[-0.02em] text-rado-ink sm:text-6xl lg:text-7xl">
          {title}
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-[1.4] text-rado-slate">{description}</p>
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
    <section className={`panel-surface py-6 ${className}`}>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl leading-[1.3] text-rado-ink">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm leading-[1.4] text-rado-slate">{description}</p>
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
    <section className={`surface-dark band-${tone} rounded-[22px] p-6 sm:p-8 ${className}`}>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 className="mt-3 text-[32px] leading-[1.2] tracking-[-0.01em] text-rado-ink">
            {title}
          </h2>
          {description ? (
            <p className="mt-2 text-sm leading-[1.4] text-rado-slate">{description}</p>
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
    <div className="panel-surface min-w-0 py-4">
      <div className="flex items-center justify-between gap-3 text-rado-muted">
        <p className="font-mono text-xs uppercase tracking-[0.08em]">{label}</p>
        <Icon name={icon} />
      </div>
      <p className="page-title mt-5 break-words text-[32px] leading-[1.1] tracking-[-0.01em] text-rado-ink">
        {value}
      </p>
      <p className="mt-2 text-xs text-rado-slate">{detail}</p>
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "info";
}) {
  const tones = {
    neutral: "bg-rado-stone-wash text-rado-slate",
    success: "bg-rado-pale-green text-rado-green",
    warning: "bg-rado-coral-wash text-rado-coral-ink",
    info: "bg-rado-pale-blue text-rado-blue",
  };
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function SampleNotice({
  children = "Sample mode · actions stay in this browser preview",
}: {
  children?: ReactNode;
}) {
  return (
    <p className="mb-10 flex items-start gap-3 text-sm leading-[1.4] text-rado-slate">
      <span className="shrink-0 font-mono text-xs uppercase leading-5 tracking-[0.08em] text-rado-coral-ink">
        Sample data
      </span>
      <span>{children}</span>
    </p>
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
    <div className="grid min-h-56 place-items-center rounded-lg border border-dashed border-rado-line px-5 py-9 text-center">
      <div className="grid justify-items-center">
        <span className="text-rado-muted">
          <Icon name={icon} className="size-7" />
        </span>
        <p className="mt-3 text-sm font-medium text-rado-ink">{title}</p>
        <p className="mt-1 max-w-xs text-sm leading-6 text-rado-slate">{description}</p>
      </div>
    </div>
  );
}
