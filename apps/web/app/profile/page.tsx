import { listUserLoginHistory, listUserSessions } from "@hwa/db";
import { logoutAllDevices } from "../actions";
import { MemberShell } from "../_components/member-shell";
import { requireActiveSession } from "../../lib/server/request";
import { getRuntime } from "../../lib/server/runtime";

function describeAgent(agent: string | null): string {
  if (!agent) return "Unknown device";
  if (/iphone|ipad/iu.test(agent)) return "Apple mobile device";
  if (/android/iu.test(agent)) return "Android device";
  if (/windows/iu.test(agent)) return "Windows computer";
  if (/macintosh|mac os/iu.test(agent)) return "Mac computer";
  return "Web browser";
}

export default async function ProfilePage() {
  const session = await requireActiveSession();
  const { database } = getRuntime();
  const [history, activeSessions] = await Promise.all([listUserLoginHistory(database.db, session.userId), listUserSessions(database.db, session.userId)]);
  return <MemberShell session={session} active="profile"><header className="page-header"><div><p className="kicker">MEMBER ACCOUNT</p><h1>{session.displayName}</h1><p>Your identity and access details are maintained from the verified roster.</p></div></header><div className="profile-layout"><section className="profile-card"><h2>Membership</h2><dl><div><dt>Email</dt><dd>{session.email}</dd></div><div><dt>Status</dt><dd><span className="state-chip active">Active</span></dd></div><div><dt>Badge</dt><dd>{session.badge === "spouse" ? "Spouse" : session.badge === "four-year" ? "Four-year graduate" : "Two-year graduate"}</dd></div><div><dt>Class</dt><dd>{session.graduationYear ?? "Not assigned"}</dd></div></dl></section><section className="profile-card security-card"><h2>Security & sessions</h2><p>{activeSessions.length} active {activeSessions.length === 1 ? "session" : "sessions"}. This device is marked below.</p><ul className="session-list">{activeSessions.map((item) => <li key={item.id}><span className="session-icon" aria-hidden="true">◇</span><div><strong>{describeAgent(item.userAgent)} {item.id === session.sessionId && <span className="current-chip">This device</span>}</strong><span>Last used {item.lastSeenAt.toLocaleString()}</span></div></li>)}</ul><form action={logoutAllDevices}><button className="danger-button" type="submit">Sign out on every device</button></form></section><section className="profile-card history-card"><h2>Recent sign-in history</h2><div className="history-table" role="table"><div className="history-row header" role="row"><span>Result</span><span>Device</span><span>When</span></div>{history.map((event, index) => <div className="history-row" role="row" key={`${event.occurredAt.toISOString()}-${index}`}><span><span className={`state-chip ${event.outcome === "success" || event.outcome === "recovery-used" ? "active" : "neutral"}`}>{event.outcome}</span></span><span>{describeAgent(event.userAgent)}</span><time dateTime={event.occurredAt.toISOString()}>{event.occurredAt.toLocaleString()}</time></div>)}</div></section></div></MemberShell>;
}
