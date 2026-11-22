const PATHS = {
  arrow: "M7 17 17 7M8 7h9v9",
  asterisk: "M12 4v16M5 8l14 8M19 8 5 16",
  blocks: "M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3ZM4 7.5l8 4.5 8-4.5M12 12v9",
  building: "M5 21V5h10v16M15 10h4v11M3 21h18M8.5 9h3M8.5 13h3M8.5 17h3",
  chain: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1",
  check: "m5 12.5 4.5 4.5L19 7.5",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2",
  coin: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM15 9c-.5-1-1.6-1.5-3-1.5-1.8 0-3 .9-3 2.2 0 3.2 6 1.4 6 4.6 0 1.3-1.2 2.2-3 2.2-1.4 0-2.5-.5-3-1.5M12 6v12",
  file: "M7 3h7l4 4v14H7V3ZM14 3v4h4M10 12h5M10 16h5",
  heart: "M12 20s-7-4.4-8.6-9A4.7 4.7 0 0 1 12 7.2 4.7 4.7 0 0 1 20.6 11C19 15.6 12 20 12 20Z",
  lock: "M6 11h12v10H6V11ZM8.5 11V7.5a3.5 3.5 0 0 1 7 0V11",
  pill: "m10 20 10-10a4.2 4.2 0 0 0-6-6L4 14a4.2 4.2 0 0 0 6 6ZM9 9l6 6",
  plus: "M12 5v14M5 12h14",
  pulse: "M3 12h4l2.5-6 4 12 2.5-6h5",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4",
  shield: "M12 3 5 6v5c0 4.5 2.8 8 7 10 4.2-2 7-5.5 7-10V6l-7-3Z",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM3 20c.5-3.5 2.8-5.5 6-5.5s5.5 2 6 5.5M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.8c1.7.8 2.7 2.5 3 5.2",
  wallet: "M4 7h15a1 1 0 0 1 1 1v11H5a1 1 0 0 1-1-1V7Zm0 0 12-3v3M16 13h.01",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  return (
    <svg aria-hidden="true" className={`shrink-0 ${className}`} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24">
      <path d={PATHS[name]} />
    </svg>
  );
}
