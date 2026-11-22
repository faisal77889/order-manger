import { Router } from "express";
import { query, validationResult } from "express-validator";
import { db } from "../prisma/db.ts";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const ALLOWED_STATUSES = ["pending", "paid", "shipped", "cancelled"];
const CHUNK_SIZE = 5000;

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

const exportOrdersValidators = [
    query("status")
        .optional({ values: "falsy" })
        .trim()
        .toLowerCase()
        .isIn(ALLOWED_STATUSES)
        .withMessage(`Invalid 'status' parameter. Allowed values: ${ALLOWED_STATUSES.join(", ")}.`),
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


function formatCsvCell(val) {
    if (val === null || val === undefined) return "";
    let str = val instanceof Date ? val.toISOString() : String(val);

    if (/^[=+\-@]/.test(str)) {
        str = `'${str}`;
    }

    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function writeChunkToResponse(res, text) {
    if (!res.write(text)) {
        return new Promise((resolve) => res.once("drain", resolve));
    }
    return Promise.resolve();
}


router.get("/orders", requireAuth, exportOrdersValidators, async (req, res) => {
    const status = req.query.status ? String(req.query.status).trim().toLowerCase() : null;

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

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="orders_export.csv"');

    let clientAborted = false;
    req.on("close", () => {
        clientAborted = true;
    });

    try {
        await writeChunkToResponse(
            res,
            "id,customer_id,customer_name,customer_email,status,order_date,total_amount\n"
        );

        let lastId = 0;

        while (!clientAborted) {
            let queryBuilder = db.orm.public.Order.where((o) => o.id.gt(lastId));

            if (status) {
                queryBuilder = queryBuilder.where({ status });
            }
            if (from_date) {
                queryBuilder = queryBuilder.where((o) => o.order_date.gte(from_date));
            }
            if (to_date) {
                queryBuilder = queryBuilder.where((o) => o.order_date.lte(to_date));
            }

            const batch = await queryBuilder
                .orderBy((o) => o.id.asc())
                .select("id", "customer_id", "status", "order_date", "total_amount")
                .include("customer", (c) => c.select("name", "email"))
                .limit(CHUNK_SIZE)
                .all();

            if (batch.length === 0) {
                break;
            }

            let csvBuffer = "";
            for (const row of batch) {
                csvBuffer +=
                    [
                        formatCsvCell(row.id),
                        formatCsvCell(row.customer_id),
                        formatCsvCell(row.customer?.name ?? ""),
                        formatCsvCell(row.customer?.email ?? ""),
                        formatCsvCell(row.status),
                        formatCsvCell(row.order_date),
                        formatCsvCell(row.total_amount),
                    ].join(",") + "\n";
            }

            await writeChunkToResponse(res, csvBuffer);

            lastId = batch[batch.length - 1].id;

            if (batch.length < CHUNK_SIZE) {
                break;
            }
        }

        if (!clientAborted) {
            res.end();
        }
    } catch (err) {
        console.error("Error streaming orders CSV export:", err);
        if (!res.headersSent) {
            return res.status(500).json({ error: "Failed to export orders." });
        }
        res.end();
    }
});

export default router;
