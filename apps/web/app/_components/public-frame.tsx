import type { ReactNode } from "react";
import Link from "next/link";

export function PublicFrame({ eyebrow, title, description, children, footer }: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return <main className="public-shell">
    <section className="public-story" aria-label="HWA Connect">
      <Link className="public-brand" href="/"><span>HWA</span><strong>Connect</strong></Link>
      <div className="story-copy"><p className="kicker">HERBERT W. ARMSTRONG COLLEGE</p><blockquote>“A familiar place,<br /><em>beautifully reconnected.</em>”</blockquote><p>A private community built to keep the friendships, service, and shared history of HWA close.</p></div>
      <p className="story-foot">EST. 2001 · EDMOND, OKLAHOMA</p>
    </section>
    <section className="public-form-panel">
      <div className="public-form-wrap"><p className="kicker">{eyebrow}</p><h1>{title}</h1><p className="public-description">{description}</p>{children}{footer && <footer className="auth-footer">{footer}</footer>}</div>
    </section>
  </main>;
}
