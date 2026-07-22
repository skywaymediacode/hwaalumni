import { GateForm } from "./_components/auth-forms";
import Link from "next/link";

export default function WelcomeGatePage() {
  return <main className="gate-page">
    <header className="gate-header"><Link className="public-brand" href="/"><span>HWA</span><strong>Connect</strong></Link><p>PRIVATE ALUMNI COMMUNITY</p></header>
    <section className="gate-stage">
      <div className="gate-intro"><p className="kicker">WELCOME HOME</p><h1>Some doors open<br />with a <em>shared memory.</em></h1><p>Enter the date woven into our story to open the alumni portal.</p></div>
      <div className="briefcase" aria-label="Combination lock">
        <div className="briefcase-handle" aria-hidden="true" />
        <div className="briefcase-case"><div className="case-monogram" aria-hidden="true">H</div><GateForm /><p className="ritual-note">This welcome ritual is not a sign-in or security check.</p></div>
      </div>
    </section>
    <footer className="gate-footer"><span>HERBERT W. ARMSTRONG COLLEGE</span><a href="/login">Already opened the portal? Sign in</a></footer>
  </main>;
}
