import { db } from "../prisma/db.ts";


export async function logAudit({
    user_id = null,
    actor_email = null,
    action,
    entity = null,
    entity_id = null,
    details = null,
    ormClient = db.orm,
}) {
    try {
        await ormClient.public.AuditLog.create({
            user_id: user_id ?? null,
            actor_email: actor_email ?? null,
            action,
            entity: entity ?? null,
            entity_id: entity_id !== null && entity_id !== undefined ? String(entity_id) : null,
            details: details ?? null,
        });
    } catch (err) {
        console.error("Failed to write audit log:", err);
    }
}

export default { logAudit };
