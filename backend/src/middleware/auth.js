import jwt from "jsonwebtoken";
import { db } from "../prisma/db.ts";

/**
 * Middleware: requireAuth
 * Verifies the JWT Bearer token and checks if the user is active in the database.
 * Requirement 4.7 & 4.9:
 * - Missing, bad, or expired token returns 401.
 * - Checks is_active on every request; disabled users return 401.
 */
export async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization || req.headers.Authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            error: "Authentication required. Missing or malformed Bearer token.",
        });
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET || "default_jwt_secret_key"
        );

        // Verify that the user exists and is currently active (Section 4.9)
        const user = await db.orm.public.AdminUser.where({ id: decoded.id }).first();

        if (!user) {
            return res.status(401).json({
                error: "Invalid token: user not found.",
            });
        }

        if (user.is_active === false) {
            return res.status(401).json({
                error: "User account has been disabled.",
            });
        }

        // Attach authenticated user to the request object
        req.user = {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role, // 'admin' or 'viewer'
            is_active: user.is_active,
        };

        next();
    } catch (err) {
        if (err.name === "TokenExpiredError") {
            return res.status(401).json({
                error: "Token has expired. Please log in again.",
            });
        }
        return res.status(401).json({
            error: "Invalid authentication token.",
        });
    }
}

/**
 * Middleware: requireAdmin
 * Enforces admin-only access (e.g. for user management, imports, mutations).
 * Requirement 4.7:
 * - A viewer calling an admin write endpoint gets 403.
 */
export function requireAdmin(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            error: "Authentication required.",
        });
    }

    if (req.user.role !== "admin") {
        return res.status(403).json({
            error: "Forbidden: Admin access required.",
        });
    }

    next();
}

/**
 * Middleware: requireRole
 * Factory for checking any combination of allowed roles (e.g. requireRole('admin', 'viewer')).
 */
export function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                error: "Authentication required.",
            });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                error: `Forbidden: Requires one of the following roles: ${allowedRoles.join(", ")}`,
            });
        }

        next();
    };
}

export default {
    requireAuth,
    requireAdmin,
    requireRole,
};
