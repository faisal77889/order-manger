import { Router } from "express";
import { query, validationResult } from "express-validator";
import { db } from "../prisma/db.ts";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();

function handleValidationErrors(req, res, next) {
    const result = validationResult(req);
    if (!result.isEmpty()) {
        const errors = result.array();
        return res.status(400).json({
            error: errors[0].msg,
            errors,
        });
    }
    next();
}

const listAuditLogsValidators = [
    query("page")
        .optional({ values: "falsy" })
        .isInt({ min: 1 })
        .withMessage("Invalid 'page' parameter. Must be an integer >= 1.")
        .toInt(),
    query("page_size")
        .optional({ values: "falsy" })
        .isInt({ min: 1, max: 100 })
        .withMessage("Invalid 'page_size' parameter. Must be an integer between 1 and 100.")
        .toInt(),
    query("user_id")
        .optional({ values: "falsy" })
        .isInt({ min: 1 })
        .withMessage("Invalid 'user_id' parameter. Must be a positive integer.")
        .toInt(),
    query("action")
        .optional({ values: "falsy" })
        .isString()
        .trim(),
    query("from_date")
        .optional({ values: "falsy" })
        .trim()
        .custom((val) => !isNaN(new Date(val).getTime()))
        .withMessage("Invalid 'from_date' parameter. Must be a valid date format."),
    query("to_date")
        .optional({ values: "falsy" })
        .trim()
        .custom((val, { req }) => {
            const toDate = new Date(val);
            if (isNaN(toDate.getTime())) {
                throw new Error("Invalid 'to_date' parameter. Must be a valid date format.");
            }
            if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
                toDate.setUTCHours(23, 59, 59, 999);
            }
            if (req.query.from_date) {
                const fromDate = new Date(req.query.from_date);
                if (!isNaN(fromDate.getTime()) && fromDate > toDate) {
                    throw new Error("'from_date' cannot be greater than 'to_date'.");
                }
            }
            return true;
        }),
    handleValidationErrors,
];

function applyAuditLogFilters(collection, filters) {
    let ormQuery = collection;

    if (filters.user_id !== null) {
        ormQuery = ormQuery.where({ user_id: filters.user_id });
    }

    if (filters.action) {
        ormQuery = ormQuery.where({ action: filters.action });
    }

    if (filters.from_date) {
        ormQuery = ormQuery.where((log) => log.createdAt.gte(filters.from_date));
    }

    if (filters.to_date) {
        ormQuery = ormQuery.where((log) => log.createdAt.lte(filters.to_date));
    }

    return ormQuery;
}


router.get("/", requireAuth, requireAdmin, listAuditLogsValidators, async (req, res) => {
    const page = req.query.page ? Number(req.query.page) : 1;
    const page_size = req.query.page_size ? Number(req.query.page_size) : 20;
    const offset = (page - 1) * page_size;
    const user_id = req.query.user_id ? Number(req.query.user_id) : null;
    const action =
        req.query.action && String(req.query.action).trim() !== ""
            ? String(req.query.action).trim()
            : null;

    let from_date = null;
    if (req.query.from_date) {
        from_date = new Date(String(req.query.from_date));
    }

    let to_date = null;
    if (req.query.to_date) {
        const rawTo = String(req.query.to_date).trim();
        to_date = new Date(rawTo);
        if (/^\d{4}-\d{2}-\d{2}$/.test(rawTo)) {
            to_date.setUTCHours(23, 59, 59, 999);
        }
    }

    try {
        const filteredLogs = applyAuditLogFilters(db.orm.public.AuditLog, {
            user_id,
            action,
            from_date,
            to_date,
        });

        const orderedLogs = filteredLogs.orderBy([
            (log) => log.createdAt.desc(),
            (log) => log.id.desc(),
        ]);

        const [rows, countResult] = await Promise.all([
            orderedLogs
                .select(
                    "id",
                    "user_id",
                    "actor_email",
                    "action",
                    "entity",
                    "entity_id",
                    "details",
                    "createdAt"
                )
                .include("user", (u) => u.select("id", "name", "email", "role"))
                .limit(page_size)
                .offset(offset)
                .all(),
            filteredLogs.aggregate((agg) => ({
                total: agg.count(),
            })),
        ]);

        const total = Number(countResult?.total ?? 0);
        const total_pages = total === 0 ? 0 : Math.ceil(total / page_size);

        const items = rows.map((row) => ({
            id: row.id,
            user_id: row.user_id,
            actor_email: row.actor_email ?? row.user?.email ?? null,
            actor_name: row.user?.name ?? null,
            action: row.action,
            entity: row.entity,
            entity_id: row.entity_id,
            details: row.details,
            created_at: row.createdAt,
        }));

        return res.status(200).json({
            items,
            page,
            page_size,
            total,
            total_pages,
            has_more: page * page_size < total,
        });
    } catch (err) {
        console.error("Error fetching audit logs:", err);
        return res.status(500).json({ error: "Failed to fetch audit logs." });
    }
});

export default router;
