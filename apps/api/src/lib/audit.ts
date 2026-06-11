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
 * TransactionalDbClient widens DbClient to expose the postgres-js
 * `.transaction()` method that Drizzle passes through.  We keep the
 * narrower DbClient alias in db.ts for ordinary queries and only require
 * the wider type here so that callers remain unchanged.
 */
export type TransactionalDbClient = DbClient & {
  transaction<T>(
    fn: (tx: DbClient) => Promise<T>,
    config?: { isolationLevel?: string; accessMode?: string; deferrable?: boolean },
  ): Promise<T>;
};

/**
 * withAudit — real Drizzle transaction wrapper that enforces the audit-log rule.
 *
 * ARCHITECTURAL RULE (from design spec):
 *   Every domain write (INSERT / UPDATE / DELETE on any table except
 *   audit_log itself) MUST be wrapped in withAudit(). No direct writes
 *   outside this helper are permitted in Hono route handlers.
 *
 * Atomicity: the domain work (fn) and the audit_log INSERT execute inside
 * a single db.transaction() call so they commit or roll back together.
 * The callback receives the transaction handle (tx: DbClient) — callers
 * must use it for all writes within the block.
 */
export async function withAudit<T>(
  db: TransactionalDbClient,
  entry: AuditEntry,
  fn: (tx: DbClient) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const result = await fn(tx);

    await tx.insert(auditLog).values({
      actor: entry.actor,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      detail: entry.detail ?? null,
    });

    return result;
  });
}
