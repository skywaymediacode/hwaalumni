import { logout } from "../actions";
import { PublicFrame } from "../_components/public-frame";
import { readSession } from "../../lib/server/request";
import { redirect } from "next/navigation";

export default async function PendingPage() {
  const session = await readSession();
  if (session?.state === "active") redirect("/home");
  return <PublicFrame eyebrow="ACCESS REQUEST RECEIVED" title="Your place is being prepared." description="An administrator will compare your request with the verified alumni roster. You’ll receive an email after a decision is made." footer={<a href="/login">Return to sign in</a>}>
    <div className="pending-card"><span className="pending-seal" aria-hidden="true">H</span><div><h2>Review pending</h2><p>No community posts, profiles, directory records, or class spaces are available until approval.</p></div></div>
    {session && <form action={logout}><button className="secondary submit" type="submit">Sign out</button></form>}
  </PublicFrame>;
}
