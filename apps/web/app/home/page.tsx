import { MemberShell } from "../_components/member-shell";
import { requireActiveSession } from "../../lib/server/request";

const activity = [
  { eyebrow: "COMMUNITY WALL", title: "Welcome to your private alumni community", detail: "Milestone 1 protects every community route with active-account authorization." },
  { eyebrow: "CLASS SPACES", title: "Your graduating class stays private", detail: "Graduates see only their assigned class group; spouse accounts receive no class group." },
  { eyebrow: "SECURITY", title: "Your account is protected by secure sessions", detail: "Sign out on every device at any time from your profile security panel." }
];

export default async function HomePage() {
  const session = await requireActiveSession();
  const firstName = session.displayName.split(/\s+/u)[0] || "friend";
  const initials = session.displayName.split(/\s+/u).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return <MemberShell session={session} active="home">
    <header className="topbar"><div><span className="kicker">PRIVATE ALUMNI COMMUNITY</span><h1>Welcome back, {firstName}.</h1></div><div className="actions"><a className="top-action" href="/directory">Find alumni</a><a className="primary top-action" href="/profile">Your profile</a><div className="avatar" aria-label={`${session.displayName} profile`}>{initials}</div></div></header>
    <section className="hero" aria-labelledby="welcome-title"><div><p className="kicker">HWA CONNECT · MEMBER HOME</p><h2 id="welcome-title">A familiar place,<br /><em>beautifully reconnected.</em></h2><p>Your verified HWA community is taking shape. Registration, approvals, member access, and administrator safeguards are now in place.</p><div className="hero-actions"><a className="primary top-action" href="/directory">Explore the directory</a><a href="https://donate.pcog.org">Donate ↗</a></div></div><div className="monogram" aria-hidden="true"><span>H</span><small>EST. 2001</small></div></section>
    <div className="content-grid"><section aria-labelledby="activity-title"><div className="section-heading"><div><p className="kicker">LATEST</p><h2 id="activity-title">Community foundation</h2></div></div><div className="feed">{activity.map((item, index) => <article key={item.title}><div className={`portrait portrait-${index + 1}`} aria-hidden="true">{[initials, session.graduationYear?.toString().slice(-2) ?? "H", "✓"][index]}</div><div><p className="eyebrow">{item.eyebrow}</p><h3>{item.title}</h3><p>{item.detail}</p><span>{index === 0 ? "Available now" : "Privacy by design"}</span></div></article>)}</div></section><aside className="side-stack"><section className="panel"><p className="kicker">MEMBERSHIP</p><h2>{session.badge === "spouse" ? "HWA community member" : `Class of ${session.graduationYear}`}</h2><p>Your roster details are maintained by administrators to keep group access accurate.</p><a className="primary top-action full" href="/profile">View profile & security</a></section><section className="quote"><p>“Iron sharpeneth iron; so a man sharpeneth the countenance of his friend.”</p><span>PROVERBS 27:17</span></section></aside></div>
  </MemberShell>;
}
