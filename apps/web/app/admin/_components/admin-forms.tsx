"use client";

import type { ManagedUser, PendingRegistration } from "@hwa/db";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { importRoster, manageUser, previewRoster, reviewRegistration, type AdminFormState } from "../actions";

const initialState: AdminFormState = { status: "idle" };
const years = Array.from({ length: 26 }, (_, index) => 2001 + index);

function Notice({ state }: { state: AdminFormState }) {
  if (!state.message) return null;
  return <p className={`form-notice ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>;
}

function Submit({ children, className = "primary" }: { children: string; className?: string }) {
  const { pending } = useFormStatus();
  return <button className={className} type="submit" disabled={pending}>{pending ? "Working…" : children}</button>;
}

function ReviewButtons() {
  const { pending } = useFormStatus();
  return <div className="decision-buttons"><button className="approve-button" type="submit" name="decision" value="approve" disabled={pending}>{pending ? "Saving…" : "Approve member"}</button><button className="reject-button" type="submit" name="decision" value="reject" disabled={pending}>{pending ? "Saving…" : "Reject request"}</button></div>;
}

export function RegistrationReviewForm({ registration }: { registration: PendingRegistration }) {
  const [state, action] = useActionState(reviewRegistration, initialState);
  return <form action={action} className="review-form"><Notice state={state} /><input type="hidden" name="registrationRequestId" value={registration.id} /><div className="admin-form-grid"><label><span>Badge</span><select name="badge" defaultValue={registration.rosterBadge}><option value="two-year">Two-year graduate</option><option value="four-year">Four-year graduate</option><option value="spouse">Spouse</option></select></label><label><span>Graduation year</span><select name="graduationYear" defaultValue={registration.rosterGraduationYear ?? ""}><option value="">No class year</option>{years.map((year) => <option value={year} key={year}>{year}</option>)}</select></label></div><label><span>Decision reason</span><textarea name="reason" maxLength={500} placeholder="Record the evidence and rationale for this decision." required /></label><ReviewButtons /></form>;
}

export function ManagedUserForm({ user }: { user: ManagedUser }) {
  const [state, action] = useActionState(manageUser, initialState);
  return <form action={action} className="managed-user-form"><Notice state={state} /><input type="hidden" name="subjectUserId" value={user.id} /><div className="admin-form-grid three"><label><span>Display name</span><input name="displayName" defaultValue={user.displayName} maxLength={120} required /></label><label><span>Role</span><select name="role" defaultValue={user.role}><option value="member">Member</option><option value="super-admin">Super administrator</option></select></label><label><span>Account state</span><select name="state" defaultValue={user.state}><option value="active">Active</option><option value="suspended">Suspended</option><option value="deactivated">Deactivated</option></select></label><label><span>Badge</span><select name="badge" defaultValue={user.badge ?? "spouse"}><option value="two-year">Two-year graduate</option><option value="four-year">Four-year graduate</option><option value="spouse">Spouse</option></select></label><label><span>Graduation year</span><select name="graduationYear" defaultValue={user.graduationYear ?? ""}><option value="">No class year</option>{years.map((year) => <option value={year} key={year}>{year}</option>)}</select></label><label className="reviewer-check"><input type="checkbox" name="isRegistrationReviewer" defaultChecked={user.isRegistrationReviewer} /><span>Registration reviewer</span></label></div><label><span>Required change reason</span><textarea name="reason" maxLength={500} required /></label><Submit>Save account changes</Submit></form>;
}

function PreviewResults({ state }: { state: AdminFormState }) {
  if (!state.preview) return null;
  return <section className="roster-preview" aria-label="Roster preview">{state.preview.issues.length > 0 && <ul className="issue-list">{state.preview.issues.map((issue, index) => <li key={`${issue.rowNumber ?? "file"}-${index}`}>{issue.rowNumber ? `Row ${issue.rowNumber}: ` : ""}{issue.message}</li>)}</ul>}{state.preview.rows.length > 0 && <div className="preview-table"><div className="preview-row header"><span>Row</span><span>Name</span><span>Email</span><span>Badge / year</span></div>{state.preview.rows.map((row) => <div className="preview-row" key={row.rowNumber}><span>{row.rowNumber}</span><span>{row.fullName}</span><span>{row.email}</span><span>{row.badge}{row.graduationYear ? ` · ${row.graduationYear}` : ""}</span></div>)}</div>}{state.preview.totalRows > state.preview.rows.length && <p>Showing the first {state.preview.rows.length} of {state.preview.totalRows} valid rows.</p>}</section>;
}

export function RosterTools() {
  const [previewState, previewAction] = useActionState(previewRoster, initialState);
  const [importState, importAction] = useActionState(importRoster, initialState);
  return <div className="roster-tools"><form action={previewAction} className="upload-form"><h3>1. Preview and validate</h3><p>Required headers: <code>full_name,email,badge,graduation_year</code></p><Notice state={previewState} /><label><span>Roster CSV</span><input name="rosterFile" type="file" accept=".csv,text/csv" required /></label><Submit className="secondary-action">Preview CSV</Submit><PreviewResults state={previewState} /></form><form action={importAction} className="upload-form"><h3>2. Re-select and import</h3><p>The file is validated again. Valid rows are audited; existing emails are skipped.</p><Notice state={importState} /><label><span>Validated roster CSV</span><input name="rosterFile" type="file" accept=".csv,text/csv" required /></label><Submit>Import roster</Submit><PreviewResults state={importState} /></form></div>;
}
