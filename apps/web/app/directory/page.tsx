import { listActiveDirectory } from "@hwa/db";
import { MemberShell } from "../_components/member-shell";
import { requireActiveSession } from "../../lib/server/request";
import { getRuntime } from "../../lib/server/runtime";

export default async function DirectoryPage() {
  const session = await requireActiveSession();
  const members = await listActiveDirectory(getRuntime().database.db);
  return <MemberShell session={session} active="directory"><header className="page-header"><div><p className="kicker">VERIFIED COMMUNITY</p><h1>Alumni directory</h1><p>Only approved, active members appear here.</p></div><span className="count-chip">{members.length} {members.length === 1 ? "member" : "members"}</span></header><section className="directory-grid" aria-label="Approved alumni">{members.map((member) => { const initials = member.displayName.split(/\s+/u).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); return <article className="directory-card" key={member.id}><div className="avatar directory-avatar" aria-hidden="true">{initials}</div><div><h2>{member.displayName}</h2><p>{member.badge === "spouse" ? "Spouse · HWA community" : `${member.badge === "four-year" ? "Four-year" : "Two-year"} graduate · Class of ${member.graduationYear}`}</p>{member.assignedClassYears.length > 0 && <span className="class-chip">Class {member.assignedClassYears.join(", ")}</span>}</div></article>; })}{members.length === 0 && <div className="empty-state"><span>H</span><h2>The directory is ready.</h2><p>Approved members will appear here.</p></div>}</section></MemberShell>;
}
