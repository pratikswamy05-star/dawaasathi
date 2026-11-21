import type { Request } from 'express';
import { json, q } from '../db';

/** Append-only audit trail. Never stores passwords or full medical records — only ids and short details. */
export async function audit(
  req: Request | null,
  action: string,
  entity?: string,
  entityId?: string | number | null,
  details: Record<string, unknown> = {},
  userIdOverride?: number | null,
) {
  try {
    await q('insert into audit_logs (user_id, action, entity, entity_id, details, ip) values ($1, $2, $3, $4, $5::jsonb, $6)', [
      userIdOverride ?? req?.user?.id ?? null,
      action,
      entity ?? null,
      entityId != null ? String(entityId) : null,
      json(details),
      req?.ip ?? null,
    ]);
  } catch (e) {
    console.error('[audit] failed', e);
  }
}
