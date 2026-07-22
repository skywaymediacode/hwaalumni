import { listPendingRegistrations } from "@hwa/db";
import { requireAdministrator } from "../../../lib/server/request";
import { getRuntime } from "../../../lib/server/runtime";
import { AdminShell } from "../_components/admin-shell";
import { RegistrationReviewForm } from "../_components/admin-forms";

export default async function RegistrationsPage() {
  const session = await requireAdministrator();
  const registrations = await listPendingRegistrations(getRuntime().database.db);
  return <AdminShell session={session} active="registrations"><header className="page-header"><div><p className="kicker">MEMBERSHIP REVIEW</p><h1>Registration queue</h1><p>Decisions are transactional, session-revoking, emailed, and permanently audited.</p></div><span className="count-chip">{registrations.length} pending</span></header><section className="admin-content">{!session.isRegistrationReviewer && <p className="form-notice error">Your administrator account is not designated as a registration reviewer. You can inspect the queue but cannot make decisions.</p>}{registrations.map((registration) => <article className="registration-card" key={registration.id}><header><div className="avatar directory-avatar" aria-hidden="true">{registration.displayName.split(/\s+/u).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</div><div><h2>{registration.displayName}</h2><p>{registration.email}</p></div><time dateTime={registration.submittedAt.toISOString()}>{registration.submittedAt.toLocaleString()}</time></header><dl><div><dt>Roster badge</dt><dd>{registration.rosterBadge}</dd></div><div><dt>Roster year</dt><dd>{registration.rosterGraduationYear ?? "None"}</dd></div></dl>{session.isRegistrationReviewer && <RegistrationReviewForm registration={registration} />}</article>)}{registrations.length === 0 && <div className="empty-state"><span>✓</span><h2>The queue is clear.</h2><p>New roster-matched requests will appear here.</p></div>}</section></AdminShell>;
}
