const nav = ["Home", "Wall", "Channels", "Messages", "Directory"];
const activity = [
  { eyebrow: "COMMUNITY WALL", title: "Welcome to the HWA Connect foundation preview", detail: "Milestone 0 establishes the visual language, architecture, and security boundaries." },
  { eyebrow: "CLASS OF 2012", title: "Class spaces will remain private by assignment", detail: "Graduates see only their assigned class group; spouse accounts receive no class group." },
  { eyebrow: "SECURITY", title: "The date gate is a ritual, never authentication", detail: "Protected content will require server-side identity and object-level authorization." }
];

export default function Home() {
  return <main className="shell">
    <aside className="rail" aria-label="Primary navigation">
      <a className="brand" href="#top" aria-label="HWA Connect home"><span>HWA</span><strong>Connect</strong></a>
      <nav>{nav.map((item, i) => <a className={i === 0 ? "active" : ""} href={`#${item.toLowerCase()}`} key={item}><span aria-hidden="true">{["⌂", "◇", "#", "✉", "◎"][i]}</span>{item}</a>)}</nav>
      <div className="rail-note"><span className="status" />Foundation preview</div>
    </aside>
    <section className="workspace" id="top">
      <header className="topbar"><div><span className="kicker">PRIVATE ALUMNI COMMUNITY</span><h1>Good evening, Mia.</h1></div><div className="actions"><button type="button">Search</button><button className="primary" type="button">Create</button><div className="avatar" aria-label="Mia Hart profile">MH</div></div></header>
      <section className="hero" aria-labelledby="welcome-title"><div><p className="kicker">HWA CONNECT · MILESTONE 0</p><h2 id="welcome-title">A familiar place,<br/><em>beautifully reconnected.</em></h2><p>This reviewable foundation demonstrates the premium collegiate direction while the protected application remains deliberately unimplemented.</p><div className="hero-actions"><button className="primary" type="button">Review foundation</button><a href="https://donate.pcog.org">Donate ↗</a></div></div><div className="monogram" aria-hidden="true"><span>H</span><small>EST. 2001</small></div></section>
      <div className="content-grid">
        <section aria-labelledby="activity-title"><div className="section-heading"><div><p className="kicker">LATEST</p><h2 id="activity-title">Community highlights</h2></div><button type="button">View all</button></div><div className="feed">{activity.map((item, i) => <article key={item.title}><div className={`portrait portrait-${i + 1}`} aria-hidden="true">{["MH", "12", "✓"][i]}</div><div><p className="eyebrow">{item.eyebrow}</p><h3>{item.title}</h3><p>{item.detail}</p><span>{i === 0 ? "Just now" : i === 1 ? "Foundation policy" : "Defense in depth"}</span></div></article>)}</div></section>
        <aside className="side-stack"><section className="panel"><p className="kicker">PROFILE</p><h2>Make your profile feel like you.</h2><div className="progress"><span style={{width:"68%"}} /></div><p>Foundation demo · 68% complete</p><button className="primary full" type="button">Continue profile</button></section><section className="quote"><p>“Iron sharpeneth iron; so a man sharpeneth the countenance of his friend.”</p><span>PROVERBS 27:17</span></section></aside>
      </div>
    </section>
    <nav className="mobile-nav" aria-label="Mobile navigation">{nav.map((item, i) => <a className={i === 0 ? "active" : ""} href={`#${item.toLowerCase()}`} key={item}><span aria-hidden="true">{["⌂", "◇", "#", "✉", "◎"][i]}</span>{item}</a>)}</nav>
  </main>;
}
