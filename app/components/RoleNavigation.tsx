"use client";

import { Icon, type IconName } from "./icons";

export const ROLES: readonly {
  id: "patient" | "hospital" | "provider" | "responder" | "insurer" | "public";
  label: string;
  icon: IconName;
}[] = [
  { id: "patient", label: "Patient", icon: "heart" },
  { id: "hospital", label: "Hospital", icon: "building" },
  { id: "provider", label: "Lab & pharmacy", icon: "pill" },
  { id: "responder", label: "Responder", icon: "asterisk" },
  { id: "insurer", label: "Insurer", icon: "shield" },
  { id: "public", label: "Public chain", icon: "chain" },
];

export type RoleId = (typeof ROLES)[number]["id"];

export function RoleNavigation({
  activeRole,
  onSelect,
  allowed,
}: {
  activeRole: RoleId;
  onSelect: (role: RoleId) => void;
  /** A signed-in wallet sees only its own workspace and the public chain. */
  allowed?: readonly RoleId[];
}) {
  const roles = allowed ? ROLES.filter(({ id }) => allowed.includes(id)) : ROLES;
  return (
    <>
      <label className="sr-only" htmlFor="role-select">
        Choose a demo role
      </label>
      <select
        className="field bg-rado-canvas lg:hidden"
        id="role-select"
        onChange={(event) => onSelect(event.target.value as RoleId)}
        value={activeRole}
      >
        {roles.map((role) => (
          <option key={role.id} value={role.id}>
            {role.label}
          </option>
        ))}
      </select>
      <nav aria-label="Choose a demo role" className="hidden items-center gap-1 lg:flex">
        {roles.map((role) => (
          <button
            aria-current={activeRole === role.id ? "page" : undefined}
            className="nav-link"
            key={role.id}
            onClick={() => onSelect(role.id)}
            type="button"
          >
            <Icon name={role.icon} className="hidden size-4 xl:block" />
            {role.label}
          </button>
        ))}
      </nav>
    </>
  );
}
