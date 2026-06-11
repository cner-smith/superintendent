import type { DbClient } from "@superintendent/db";
import { auditLog } from "@superintendent/db";

export interface AuditEntry {
  actor: string;
  action: string;
  entity: string;
  entityId: string;
  detail?: Record<string, unknown>;
}

/**
 * withAudit — transaction wrapper that enforces the audit-log rule.
 *
 * STUB: The transaction logic will be wired to a real Drizzle transaction
 * once the DB client is confirmed live (Phase 2). For now it calls the
 * callback and appends an audit row — demonstrating the intended contract.
 *
 * ARCHITECTURAL RULE (from design spec):
 *   Every domain write (INSERT / UPDATE / DELETE on any table except
 *   audit_log itself) MUST be wrapped in withAudit(). No direct writes
 *   outside this helper are permitted in Hono route handlers.
 *
 * TODO (Phase 2): Replace the two sequential queries below with a real
 *   db.transaction(async (tx) => { ... }) call so both writes are atomic.
 */
export async function withAudit<T>(
  db: DbClient,
  entry: AuditEntry,
  fn: (db: DbClient) => Promise<T>,
): Promise<T> {
  // TODO(phase-2): wrap in db.transaction() for atomicity
  const result = await fn(db);

  await db.insert(auditLog).values({
    actor: entry.actor,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    detail: entry.detail ?? null,
  });

  return result;
}
