import type { SessionAccount } from "@hwa/db";
import type { ReactNode } from "react";
import { logout } from "../actions";

const memberNavigation = [
  { href: "/home", label: "Home", symbol: "⌂" },
  { href: "/directory", label: "Directory", symbol: "◎" },
  { href: "/profile", label: "Profile", symbol: "◇" }
] as const;

export function MemberShell({ session, active, children }: { session: SessionAccount; active: "home" | "directory" | "profile" | "admin"; children: ReactNode }) {
  const initials = session.displayName.split(/\s+/u).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return <main className="shell">
    <aside className="rail" aria-label="Primary navigation">
      <a className="brand" href="/home" aria-label="HWA Connect home"><span>HWA</span><strong>Connect</strong></a>
      <nav>{memberNavigation.map((item) => <a className={active === item.label.toLowerCase() ? "active" : ""} href={item.href} key={item.href}><span aria-hidden="true">{item.symbol}</span>{item.label}</a>)}{session.role === "super-admin" && <a className={active === "admin" ? "active" : ""} href="/admin/registrations"><span aria-hidden="true">⚙</span>Administration</a>}</nav>
      <div className="rail-user"><div className="avatar small" aria-hidden="true">{initials}</div><div><strong>{session.displayName}</strong><span>{session.graduationYear ? `Class of ${session.graduationYear}` : "HWA community"}</span></div></div>
      <form action={logout}><button className="rail-logout" type="submit">Sign out</button></form>
    </aside>
    <section className="workspace">{children}</section>
    <nav className="mobile-nav" aria-label="Mobile navigation">{memberNavigation.map((item) => <a className={active === item.label.toLowerCase() ? "active" : ""} href={item.href} key={item.href}><span aria-hidden="true">{item.symbol}</span>{item.label}</a>)}{session.role === "super-admin" && <a className={active === "admin" ? "active" : ""} href="/admin/registrations"><span aria-hidden="true">⚙</span>Admin</a>}</nav>
  </main>;
}
