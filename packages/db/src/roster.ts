import { normalizeEmail, normalizeFullName, type Badge } from "@hwa/domain";
import { parse } from "csv-parse/sync";
import { eq, sql } from "drizzle-orm";
import type { Database } from "./connection";
import { rosterEntries } from "./schema";

const expectedHeaders = ["full_name", "email", "badge", "graduation_year"] as const;

export interface RosterImportRow {
  rowNumber: number;
  fullName: string;
  normalizedFullName: string;
  email: string;
  normalizedEmail: string;
  badge: Badge;
  graduationYear: number | null;
}

export interface RosterImportIssue {
  rowNumber: number | null;
  message: string;
}

export interface RosterPreview {
  rows: readonly RosterImportRow[];
  issues: readonly RosterImportIssue[];
}

export function previewRosterCsv(csv: string): RosterPreview {
  if (csv.trim().length === 0) return { rows: [], issues: [{ rowNumber: null, message: "The CSV file is empty." }] };

  let records: Record<string, string>[];
  try {
    records = parse(csv, { columns: true, skip_empty_lines: true, trim: true, bom: true, relax_column_count: false });
  } catch {
    return { rows: [], issues: [{ rowNumber: null, message: "The CSV file could not be parsed." }] };
  }

  const headers = Object.keys(records[0] ?? {});
  if (headers.length !== expectedHeaders.length || expectedHeaders.some((header) => !headers.includes(header))) {
    return { rows: [], issues: [{ rowNumber: null, message: `Required headers: ${expectedHeaders.join(", ")}.` }] };
  }

  const rows: RosterImportRow[] = [];
  const issues: RosterImportIssue[] = [];
  const seenEmails = new Map<string, number>();
  const seenIdentities = new Map<string, number>();

  records.forEach((record, index) => {
    const rowNumber = index + 2;
    const fullName = record.full_name?.trim() ?? "";
    const email = record.email?.trim() ?? "";
    const badge = record.badge as Badge | undefined;
    const rawYear = record.graduation_year?.trim() ?? "";
    const normalizedFullName = normalizeFullName(fullName);
    const normalizedEmail = normalizeEmail(email);

    if (normalizedFullName.length < 2) issues.push({ rowNumber, message: "Full name is required." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) issues.push({ rowNumber, message: "Email is invalid." });
    if (badge !== "two-year" && badge !== "four-year" && badge !== "spouse") issues.push({ rowNumber, message: "Badge must be two-year, four-year, or spouse." });

    let graduationYear: number | null = null;
    if (badge === "spouse") {
      if (rawYear !== "") issues.push({ rowNumber, message: "Spouses cannot have a graduation year." });
    } else {
      graduationYear = Number(rawYear);
      if (!Number.isInteger(graduationYear) || graduationYear < 2001 || graduationYear > 2026) {
        issues.push({ rowNumber, message: "Graduation year must be between 2001 and 2026." });
      }
    }

    const previousEmailRow = seenEmails.get(normalizedEmail);
    if (previousEmailRow !== undefined) issues.push({ rowNumber, message: `Duplicate email; first seen on row ${previousEmailRow}.` });
    else seenEmails.set(normalizedEmail, rowNumber);

    const identityKey = `${normalizedFullName}\u0000${normalizedEmail}`;
    const previousIdentityRow = seenIdentities.get(identityKey);
    if (previousIdentityRow !== undefined) issues.push({ rowNumber, message: `Duplicate roster identity; first seen on row ${previousIdentityRow}.` });
    else seenIdentities.set(identityKey, rowNumber);

    if (issues.some((issue) => issue.rowNumber === rowNumber) || badge === undefined) return;
    rows.push({ rowNumber, fullName, normalizedFullName, email, normalizedEmail, badge, graduationYear });
  });

  return { rows, issues };
}

export async function importRosterRows(
  db: Database,
  input: { rows: readonly RosterImportRow[]; sourceBatchId: string; importedByUserId: string }
): Promise<{ inserted: number; duplicates: number }> {
  if (input.rows.length === 0) return { inserted: 0, duplicates: 0 };
  return db.transaction(async (tx) => {
    let inserted = 0;
    for (const row of input.rows) {
      const result = await tx.insert(rosterEntries).values({
        fullName: row.fullName,
        normalizedFullName: row.normalizedFullName,
        email: row.email,
        normalizedEmail: row.normalizedEmail,
        badge: row.badge,
        graduationYear: row.graduationYear,
        sourceBatchId: input.sourceBatchId,
        importedByUserId: input.importedByUserId
      }).onConflictDoNothing().returning({ id: rosterEntries.id });
      inserted += result.length;
    }
    return { inserted, duplicates: input.rows.length - inserted };
  });
}

export async function countRosterBatch(db: Database, sourceBatchId: string): Promise<number> {
  const [result] = await db.select({ count: sql<number>`count(*)::int` }).from(rosterEntries).where(eq(rosterEntries.sourceBatchId, sourceBatchId));
  return result?.count ?? 0;
}
