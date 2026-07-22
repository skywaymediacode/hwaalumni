import type { SessionAccount } from "@hwa/db";
import type { ReactNode } from "react";
import { MemberShell } from "../../_components/member-shell";

const adminTabs = [
  { href: "/admin/registrations", label: "Registrations" },
  { href: "/admin/users", label: "Users & roster" },
  { href: "/admin/audit", label: "Audit log" }
] as const;

export function AdminShell({ session, active, children }: { session: SessionAccount; active: "registrations" | "users" | "audit"; children: ReactNode }) {
  return <MemberShell session={session} active="admin"><header className="admin-bar"><div><p className="kicker">HWA CONNECT ADMINISTRATION</p><strong>Identity & access</strong></div><span>Recent MFA verified</span></header><nav className="admin-tabs" aria-label="Administration sections">{adminTabs.map((tab) => <a className={active === tab.href.split("/").at(-1) ? "active" : ""} href={tab.href} key={tab.href}>{tab.label}</a>)}</nav>{children}</MemberShell>;
}
