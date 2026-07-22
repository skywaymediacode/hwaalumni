import { listAuditEvents } from "@hwa/db";
import { requireAdministrator } from "../../../lib/server/request";
import { getRuntime } from "../../../lib/server/runtime";
import { AdminShell } from "../_components/admin-shell";

function json(value: unknown): string {
  return value === null ? "—" : JSON.stringify(value, null, 2);
}

export default async function AuditPage() {
  const session = await requireAdministrator();
  const events = await listAuditEvents(getRuntime().database.db);
  return <AdminShell session={session} active="audit"><header className="page-header"><div><p className="kicker">APPEND-ONLY EVIDENCE</p><h1>Audit log</h1><p>Security-sensitive identity and access decisions are recorded here and cannot be edited or deleted.</p></div><span className="count-chip">Latest {events.length}</span></header><section className="admin-content audit-list">{events.map((event) => <article className="audit-card" key={event.id}><header><div><p className="eyebrow">{event.action}</p><h2>{event.subjectName ?? "System event"}</h2></div><time dateTime={event.occurredAt.toISOString()}>{event.occurredAt.toLocaleString()}</time></header><p><strong>Actor:</strong> {event.actorName ?? "System"}{event.reason && <> · <strong>Reason:</strong> {event.reason}</>}</p><details><summary>View recorded change</summary><div className="audit-change"><div><span>BEFORE</span><pre>{json(event.before)}</pre></div><div><span>AFTER</span><pre>{json(event.after)}</pre></div></div></details></article>)}{events.length === 0 && <div className="empty-state"><span>H</span><h2>No audit events yet.</h2><p>Identity and access changes will appear here.</p></div>}</section></AdminShell>;
}
