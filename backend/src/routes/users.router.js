import { Router } from "express";
import { query, param, body, validationResult } from "express-validator";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { db } from "../prisma/db.ts";
import { logAudit } from "../services/audit.service.js";

const router = Router();

const ALLOWED_ROLES = ["admin", "viewer"];

function handleValidationErrors(req, res, next) {
    const result = validationResult(req);
    if (!result.isEmpty()) {
        const errors = result.array();
        return res.status(400).json({
            error: errors[0].msg,
            message: errors[0].msg,
            errors,
        });
    }
    next();
}

const listUserValidator = [
    query("page")
        .optional({ values: "falsy" })
        .trim()
        .isInt({ min: 1 })
        .withMessage("Invalid 'page' parameter. Must be an integer >= 1.")
        .toInt(),
    query("page_size")
        .optional({ values: "falsy" })
        .trim()
        .isInt({ min: 1, max: 100 })
        .withMessage("Invalid page size parameter. Must be an Integer between 1 and 100")
        .toInt(),
    query("is_active")
        .optional({ values: "falsy" })
        .trim()
        .toLowerCase()
        .isBoolean()
        .withMessage("is_active filter must be true or false")
        .customSanitizer((val) => {
            if (typeof val === "boolean") return val;
            const normalized = String(val).trim().toLowerCase();
            return normalized === "true" || normalized === "1";
        }),
    query("role")
        .optional({ values: "falsy" })
        .trim()
        .toLowerCase()
        .isIn(ALLOWED_ROLES)
        .withMessage(`Invalid 'role' filter. Allowed values: ${ALLOWED_ROLES.join(", ")}.`),
    query("q")
        .optional({ values: "falsy" })
        .isString()
        .trim(),
    handleValidationErrors,
];

const updateUserValidator = [
    param("id")
        .trim()
        .isInt({ min: 1 })
        .withMessage("Invalid user 'id'. Must be a positive integer.")
        .toInt(),
    body().custom((_val, { req }) => {
        const bodyObj = req.body && typeof req.body === "object" ? req.body : {};
        const hasRole =
            bodyObj.role !== undefined &&
            bodyObj.role !== null &&
            String(bodyObj.role).trim() !== "";
        const hasIsActive =
            bodyObj.is_active !== undefined &&
            bodyObj.is_active !== null &&
            String(bodyObj.is_active).trim() !== "";

        if (!hasRole && !hasIsActive) {
            throw new Error(
                "At least one of 'role' or 'is_active' must be provided."
            );
        }
        return true;
    }),
    body("role")
        .optional({ values: "null" })
        .isString()
        .withMessage("'role' must be a string.")
        .trim()
        .toLowerCase()
        .isIn(ALLOWED_ROLES)
        .withMessage(`Invalid 'role'. Allowed values: ${ALLOWED_ROLES.join(", ")}.`),
    body("is_active")
        .optional({ values: "null" })
        .custom((val) => {
            if (typeof val === "boolean") return true;
            if (typeof val === "string") {
                const normalized = val.trim().toLowerCase();
                if (normalized === "true" || normalized === "false") return true;
            }
            throw new Error("'is_active' must be a boolean (true or false).");
        })
        .customSanitizer((val) => {
            if (typeof val === "boolean") return val;
            return String(val).trim().toLowerCase() === "true";
        }),
    handleValidationErrors,
];

router.get("/", requireAuth, requireAdmin, listUserValidator, async (req, res) => {
    const page = req.query.page ? Number(req.query.page) : 1;
    const page_size = req.query.page_size ? Number(req.query.page_size) : 20;
    const offset = (page - 1) * page_size;
    const rawIsActive = req.query.is_active;
    const roleFilter = req.query.role
        ? String(req.query.role).trim().toLowerCase()
        : null;
    const q =
        req.query.q && String(req.query.q).trim() !== ""
            ? String(req.query.q).trim()
            : null;

    try {
        let base_query = db.orm.public.AdminUser;

        if (rawIsActive !== undefined && rawIsActive !== "") {
            const isActiveBool =
                rawIsActive === true ||
                String(rawIsActive).trim().toLowerCase() === "true" ||
                String(rawIsActive).trim() === "1";
            base_query = base_query.where({ is_active: isActiveBool });
        }

        if (roleFilter) {
            base_query = base_query.where({ role: roleFilter });
        }

        if (q) {
            const pattern = `%${q}%`;
            base_query = base_query.where((u, { fns }) =>
                fns.or(u.name.ilike(pattern), u.email.ilike(pattern))
            );
        }

        const orderedQuery = base_query.orderBy([
            (u) => u.createdAt.desc(),
            (u) => u.id.asc(),
        ]);

        const [user_from_db, total_count, active_count, admin_count] = await Promise.all([
            orderedQuery
                .select("id", "email", "name", "role", "is_active", "createdAt", "updatedAt")
                .limit(page_size)
                .offset(offset)
                .all(),
            base_query.aggregate((agg) => ({
                total: agg.count(),
            })),
            db.orm.public.AdminUser.where({ is_active: true }).aggregate((agg) => ({
                total: agg.count(),
            })),
            db.orm.public.AdminUser.where({ role: "admin" }).aggregate((agg) => ({
                total: agg.count(),
            })),
        ]);

        const total = Number(total_count?.total ?? 0);
        const total_pages = total === 0 ? 0 : Math.ceil(total / page_size);
        const active_users = Number(active_count?.total ?? 0);
        const admin_users = Number(admin_count?.total ?? 0);

        const users = user_from_db.map((user) => ({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            is_active: user.is_active,
            status: user.is_active ? "active" : "disabled",
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        }));

        return res.status(200).json({
            users,
            items: users,
            page,
            page_size,
            total,
            total_pages,
            has_more: page * page_size < total,
            summary: {
                active_users,
                admin_users,
            },
        });
    } catch (err) {
        console.error("Error listing users:", err);
        return res.status(500).json({ error: "Failed to fetch users." });
    }
});

router.patch("/:id", requireAuth, requireAdmin, updateUserValidator, async (req, res) => {
    const userId = Number(req.params.id);
    const { role, is_active } = req.body;

    const hasRole = role !== undefined && role !== null;
    const hasIsActive = is_active !== undefined && is_active !== null;

    if (!hasRole && !hasIsActive) {
        return res.status(400).json({
            error: "At least one of 'role' or 'is_active' must be provided.",
            message: "At least one of 'role' or 'is_active' must be provided.",
        });
    }

    try {
        const user_exist = await db.orm.public.AdminUser.where({ id: userId })
            .select("id", "name", "email", "is_active", "role", "createdAt")
            .first();

        if (!user_exist) {
            return res.status(404).json({
                error: "User does not exist",
                message: "User does not exist",
            });
        }

        if (user_exist.role === "admin") {
            return res.status(400).json({
                error: "Cannot change role or status of an admin user.",
                message: "Cannot change role or status of an admin user.",
            });
        }

        const updatePayload = {};
        if (hasRole) {
            updatePayload.role = role;
        }
        if (hasIsActive) {
            updatePayload.is_active = is_active;
        }

        await db.orm.public.AdminUser.where({ id: userId }).update(updatePayload);

        const updatedUser = await db.orm.public.AdminUser.where({ id: userId })
            .select("id", "name", "email", "role", "is_active", "createdAt", "updatedAt")
            .first();

        const changes = [];
        if (hasRole) {
            changes.push(
                role !== user_exist.role
                    ? `role changed from '${user_exist.role}' to '${role}'`
                    : `role confirmed as '${role}'`
            );
        }
        if (hasIsActive) {
            changes.push(
                is_active !== user_exist.is_active
                    ? `status changed from '${user_exist.is_active ? "active" : "disabled"}' to '${is_active ? "active" : "disabled"}'`
                    : `status confirmed as '${is_active ? "active" : "disabled"}'`
            );
        }

        const actionName =
            hasRole && hasIsActive
                ? "user_updated"
                : hasRole
                    ? "user_role_changed"
                    : "user_status_changed";

        await logAudit({
            user_id: req.user?.id ?? null,
            actor_email: req.user?.email ?? null,
            action: actionName,
            entity: "admin_users",
            entity_id: userId,
            details: `User '${user_exist.email}' (#${userId}) updated: ${changes.join(", ")}`,
        });

        return res.status(200).json({
            message: "User updated successfully.",
            user: {
                id: updatedUser.id,
                name: updatedUser.name,
                email: updatedUser.email,
                role: updatedUser.role,
                is_active: updatedUser.is_active,
                status: updatedUser.is_active ? "active" : "disabled",
                createdAt: updatedUser.createdAt,
                updatedAt: updatedUser.updatedAt,
            },
        });
    } catch (err) {
        console.error("Error while updating the status/role of user:", err);
        return res.status(500).json({ error: "Failed to update user." });
    }
});

export default router;
