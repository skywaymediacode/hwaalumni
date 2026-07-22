"use server";

import { randomUUID } from "node:crypto";
import {
  approveRegistration,
  importRosterRowsAuthorized,
  previewRosterCsv,
  rejectRegistration,
  updateManagedUser,
  type RosterImportIssue,
  type RosterImportRow
} from "@hwa/db";
import { can, type Badge, type Role } from "@hwa/domain";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertTrustedMutationOrigin, readSession, toActor } from "../../lib/server/request";
import { getRuntime } from "../../lib/server/runtime";

export interface AdminFormState {
  status: "idle" | "success" | "error";
  message?: string;
  preview?: {
    rows: readonly Pick<RosterImportRow, "rowNumber" | "fullName" | "email" | "badge" | "graduationYear">[];
    issues: readonly RosterImportIssue[];
    totalRows: number;
  };
}

const badgeSchema = z.enum(["two-year", "four-year", "spouse"]);
const roleSchema = z.enum(["member", "super-admin"]);
const managedStateSchema = z.enum(["active", "suspended", "deactivated"]);

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function failure(message: string): AdminFormState {
  return { status: "error", message };
}

function safeAdministrativeMessage(cause: unknown, fallback: string): string {
  if (!(cause instanceof Error)) return fallback;
  const allowed = [
    "Registration request is no longer pending.",
    "Registration account is no longer pending.",
    "Registration review is not authorized.",
    "Administrator authorization is required.",
    "The member account no longer exists.",
    "This account state must be handled through its dedicated workflow.",
    "The final active super administrator cannot be removed.",
    "A valid display name is required.",
    "A reason is required."
  ];
  return allowed.includes(cause.message) || cause.message.startsWith("Invalid account-state transition") ? cause.message : fallback;
}

async function currentAdministrator() {
  const session = await readSession();
  if (!session || session.role !== "super-admin" || session.state !== "active" || session.assurance !== "mfa") {
    throw new Error("Administrator authorization is required.");
  }
  const actor = toActor(session);
  if (!actor || !can(actor, "admin:enter")) throw new Error("Administrator authorization is required.");
  return session;
}

export async function reviewRegistration(_state: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const registrationRequestId = field(formData, "registrationRequestId");
  const decision = field(formData, "decision");
  const reason = field(formData, "reason").trim();
  const badge = badgeSchema.safeParse(field(formData, "badge"));
  if (!z.uuid().safeParse(registrationRequestId).success || !badge.success || reason.length < 3 || !["approve", "reject"].includes(decision)) {
    return failure("Complete the review fields and include a reason.");
  }
  let graduationYear: number | null = null;
  if (badge.data !== "spouse") {
    const year = Number.parseInt(field(formData, "graduationYear"), 10);
    if (!Number.isInteger(year) || year < 2001 || year > 2026) return failure("Choose a graduation year between 2001 and 2026.");
    graduationYear = year;
  }

  try {
    await assertTrustedMutationOrigin();
    const session = await currentAdministrator();
    const base = {
      registrationRequestId,
      reviewerUserId: session.userId,
      reviewerSessionId: session.sessionId,
      reason
    };
    if (decision === "approve") {
      await approveRegistration(getRuntime().database.db, { ...base, badge: badge.data, graduationYear });
    } else {
      await rejectRegistration(getRuntime().database.db, base);
    }
    revalidatePath("/admin/registrations");
    return { status: "success", message: decision === "approve" ? "Registration approved. The member must sign in again." : "Registration rejected." };
  } catch (cause) {
    return failure(safeAdministrativeMessage(cause, "The registration decision could not be saved."));
  }
}

export async function manageUser(_state: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const subjectUserId = field(formData, "subjectUserId");
  const displayName = field(formData, "displayName");
  const role = roleSchema.safeParse(field(formData, "role"));
  const state = managedStateSchema.safeParse(field(formData, "state"));
  const badge = badgeSchema.safeParse(field(formData, "badge"));
  const reason = field(formData, "reason");
  if (!z.uuid().safeParse(subjectUserId).success || !role.success || !state.success || !badge.success) {
    return failure("The account update is invalid.");
  }
  let graduationYear: number | null = null;
  if (badge.data !== "spouse") {
    const year = Number.parseInt(field(formData, "graduationYear"), 10);
    if (!Number.isInteger(year) || year < 2001 || year > 2026) return failure("Choose a graduation year between 2001 and 2026.");
    graduationYear = year;
  }
  try {
    await assertTrustedMutationOrigin();
    const session = await currentAdministrator();
    await updateManagedUser(getRuntime().database.db, {
      administratorUserId: session.userId,
      administratorSessionId: session.sessionId,
      subjectUserId,
      displayName,
      role: role.data as Role,
      state: state.data,
      badge: badge.data as Badge,
      graduationYear,
      isRegistrationReviewer: field(formData, "isRegistrationReviewer") === "on",
      reason
    });
    revalidatePath("/admin/users");
    revalidatePath("/directory");
    return { status: "success", message: "Account updated. Existing sessions were revoked." };
  } catch (cause) {
    return failure(safeAdministrativeMessage(cause, "The account update could not be saved."));
  }
}

async function readRosterFile(formData: FormData): Promise<string> {
  const file = formData.get("rosterFile");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a CSV file.");
  if (file.size > 1024 * 1024) throw new Error("Roster CSV files must be 1 MB or smaller.");
  return file.text();
}

export async function previewRoster(_state: AdminFormState, formData: FormData): Promise<AdminFormState> {
  try {
    await assertTrustedMutationOrigin();
    await currentAdministrator();
    const preview = previewRosterCsv(await readRosterFile(formData));
    return {
      status: preview.issues.length === 0 ? "success" : "error",
      message: preview.issues.length === 0 ? `${preview.rows.length} valid roster rows are ready to import.` : "Resolve every CSV issue before importing.",
      preview: { rows: preview.rows.slice(0, 25), issues: preview.issues.slice(0, 100), totalRows: preview.rows.length }
    };
  } catch (cause) {
    return failure(cause instanceof Error && (cause.message === "Choose a CSV file." || cause.message.includes("1 MB")) ? cause.message : "The roster file could not be previewed.");
  }
}

export async function importRoster(_state: AdminFormState, formData: FormData): Promise<AdminFormState> {
  try {
    await assertTrustedMutationOrigin();
    const session = await currentAdministrator();
    const preview = previewRosterCsv(await readRosterFile(formData));
    if (preview.issues.length > 0) {
      return { status: "error", message: "The roster was not imported because the CSV contains errors.", preview: { rows: preview.rows.slice(0, 25), issues: preview.issues.slice(0, 100), totalRows: preview.rows.length } };
    }
    const result = await importRosterRowsAuthorized(getRuntime().database.db, {
      administratorUserId: session.userId,
      administratorSessionId: session.sessionId,
      rows: preview.rows,
      sourceBatchId: randomUUID()
    });
    revalidatePath("/admin/audit");
    return { status: "success", message: `Roster import complete: ${result.inserted} added, ${result.duplicates} duplicates skipped.` };
  } catch (cause) {
    return failure(cause instanceof Error && (cause.message === "Choose a CSV file." || cause.message.includes("1 MB")) ? cause.message : "The roster could not be imported.");
  }
}
