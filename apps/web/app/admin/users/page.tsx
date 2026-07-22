import { listManagedUsers } from "@hwa/db";
import { requireAdministrator } from "../../../lib/server/request";
import { getRuntime } from "../../../lib/server/runtime";
import { AdminShell } from "../_components/admin-shell";
import { ManagedUserForm, RosterTools } from "../_components/admin-forms";

export default async function UsersPage() {
  const session = await requireAdministrator();
  const users = await listManagedUsers(getRuntime().database.db);
  return <AdminShell session={session} active="users"><header className="page-header"><div><p className="kicker">IDENTITY ADMINISTRATION</p><h1>Users & roster</h1><p>Roster facts, account state, roles, reviewer designation, and class membership are administrator-controlled.</p></div><span className="count-chip">{users.length} accounts</span></header><section className="admin-content"><section className="admin-section"><div className="section-heading"><div><p className="kicker">VERIFIED SOURCE</p><h2>Roster import</h2></div></div><RosterTools /></section><section className="admin-section"><div className="section-heading"><div><p className="kicker">ACCOUNT LIFECYCLE</p><h2>Member administration</h2></div></div><div className="managed-users">{users.map((user) => <article className="managed-user-card" key={user.id}><header><div><h3>{user.displayName}</h3><p>{user.email}</p></div><div className="user-chips"><span className={`state-chip ${user.state === "active" ? "active" : "neutral"}`}>{user.state}</span><span className="class-chip">{user.role}</span>{user.role === "super-admin" && <span className="class-chip">{user.hasVerifiedTotp ? "2FA active" : "2FA required"}</span>}</div></header>{user.state === "active" || user.state === "suspended" || user.state === "deactivated" ? <ManagedUserForm user={user} /> : <p className="form-notice">Use the registration workflow for {user.state} accounts.</p>}</article>)}</div></section></section></AdminShell>;
}
