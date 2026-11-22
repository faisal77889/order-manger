import { Router } from "express";
import { param, query, validationResult } from "express-validator";
import { db } from "../prisma/db.ts";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const ALLOWED_STATUSES = ["pending", "paid", "shipped", "cancelled"];
const ALLOWED_SORT_DIRS = ["asc", "desc"];

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

const customerOrdersValidators = [
    param("id")
        .isInt({ min: 1 })
        .withMessage("Invalid customer 'id'. Must be a positive integer.")
        .toInt(),
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
    query("order_date")
        .optional({ values: "falsy" })
        .trim()
        .toLowerCase()
        .isIn(ALLOWED_SORT_DIRS)
        .withMessage("Invalid 'order_date' sort direction. Allowed values: asc, desc."),
    query("total_amount")
        .optional({ values: "falsy" })
        .trim()
        .toLowerCase()
        .isIn(ALLOWED_SORT_DIRS)
        .withMessage("Invalid 'total_amount' sort direction. Allowed values: asc, desc."),
    handleValidationErrors,
];


router.get("/:id/orders", requireAuth, customerOrdersValidators, async (req, res) => {
    const customerId = Number(req.params.id);
    const page = req.query.page ? Number(req.query.page) : 1;
    const page_size = req.query.page_size ? Number(req.query.page_size) : 20;
    const offset = (page - 1) * page_size;
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

    let sortField = "order_date";
    let sortDir = "desc";

    if (req.query.total_amount) {
        sortField = "total_amount";
        sortDir = String(req.query.total_amount).trim().toLowerCase();
    } else if (req.query.order_date) {
        sortField = "order_date";
        sortDir = String(req.query.order_date).trim().toLowerCase();
    }

    try {
        const customer = await db.orm.public.Customer.where({ id: customerId })
            .select("id", "name", "email", "city", "createdAt")
            .first();

        if (!customer) {
            return res.status(404).json({ error: "Customer not found." });
        }

        let filteredOrders = db.orm.public.Order.where({ customer_id: customerId });

        if (status) {
            filteredOrders = filteredOrders.where({ status });
        }
        if (from_date) {
            filteredOrders = filteredOrders.where((o) => o.order_date.gte(from_date));
        }
        if (to_date) {
            filteredOrders = filteredOrders.where((o) => o.order_date.lte(to_date));
        }

        const orderedOrders = filteredOrders.orderBy([
            (o) => (sortDir === "asc" ? o[sortField].asc() : o[sortField].desc()),
            (o) => (sortDir === "asc" ? o.id.asc() : o.id.desc()),
        ]);

        const [rows, countResult] = await Promise.all([
            orderedOrders
                .select("id", "customer_id", "status", "order_date", "total_amount")
                .include("order_items", (items) => items.count())
                .limit(page_size)
                .offset(offset)
                .all(),
            filteredOrders.aggregate((agg) => ({
                total: agg.count(),
            })),
        ]);

        const total = Number(countResult?.total ?? 0);
        const total_pages = total === 0 ? 0 : Math.ceil(total / page_size);

        const items = rows.map((row) => ({
            id: row.id,
            customer_id: row.customer_id,
            customer_name: customer.name,
            customer_email: customer.email,
            status: row.status,
            order_date: row.order_date,
            total_amount: row.total_amount,
            items_count: Number(row.order_items ?? 0),
        }));

        return res.status(200).json({
            customer: {
                id: customer.id,
                name: customer.name,
                email: customer.email,
                city: customer.city,
                created_at: customer.createdAt,
            },
            items,
            page,
            page_size,
            total,
            total_pages,
            has_more: page * page_size < total,
        });
    } catch (err) {
        console.error(`Error fetching orders for customer ${customerId}:`, err);
        return res.status(500).json({ error: "Failed to fetch customer orders." });
    }
});

export default router;
