import { Router } from "express";
import { query, param, validationResult } from "express-validator";
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

const listOrdersValidators = [
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
    query("customer_id")
        .optional({ values: "falsy" })
        .isInt({ min: 1 })
        .withMessage("Invalid 'customer_id' parameter. Must be a positive integer.")
        .toInt(),
    query("q")
        .optional({ values: "falsy" })
        .isString()
        .trim(),
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

const getOrderByIdValidators = [
    param("id")
        .isInt({ min: 1 })
        .withMessage("Invalid order 'id'. Must be a positive integer.")
        .toInt(),
    handleValidationErrors,
];


function extractOrdersQueryParams(reqQuery) {
    const page = reqQuery.page ? Number(reqQuery.page) : 1;
    const page_size = reqQuery.page_size ? Number(reqQuery.page_size) : 20;
    const offset = (page - 1) * page_size;
    const status = reqQuery.status ? String(reqQuery.status).trim().toLowerCase() : null;
    const customer_id = reqQuery.customer_id ? Number(reqQuery.customer_id) : null;
    const q = reqQuery.q && String(reqQuery.q).trim() !== "" ? String(reqQuery.q).trim() : null;

    let from_date = null;
    if (reqQuery.from_date) {
        from_date = new Date(String(reqQuery.from_date));
    }

    let to_date = null;
    if (reqQuery.to_date) {
        const rawTo = String(reqQuery.to_date).trim();
        to_date = new Date(rawTo);
        if (/^\d{4}-\d{2}-\d{2}$/.test(rawTo)) {
            to_date.setUTCHours(23, 59, 59, 999);
        }
    }

    let sortField = "order_date";
    let sortDir = "desc";

    if (reqQuery.total_amount) {
        sortField = "total_amount";
        sortDir = String(reqQuery.total_amount).trim().toLowerCase();
    } else if (reqQuery.order_date) {
        sortField = "order_date";
        sortDir = String(reqQuery.order_date).trim().toLowerCase();
    }

    return {
        page,
        page_size,
        offset,
        status,
        from_date,
        to_date,
        customer_id,
        q,
        sortField,
        sortDir,
    };
}


function applyOrderFilters(collection, filters) {
    let ormQuery = collection;

    if (filters.status) {
        ormQuery = ormQuery.where({ status: filters.status });
    }

    if (filters.customer_id !== null) {
        ormQuery = ormQuery.where({ customer_id: filters.customer_id });
    }

    if (filters.from_date) {
        ormQuery = ormQuery.where((o) => o.order_date.gte(filters.from_date));
    }

    if (filters.to_date) {
        ormQuery = ormQuery.where((o) => o.order_date.lte(filters.to_date));
    }

    if (filters.q) {
        const pattern = `%${filters.q}%`;
        ormQuery = ormQuery.where((o, { fns }) =>
            o.customer.some((c) => fns.or(c.name.ilike(pattern), c.email.ilike(pattern)))
        );
    }

    return ormQuery;
}


router.get("/", requireAuth, listOrdersValidators, async (req, res) => {
    const {
        page,
        page_size,
        offset,
        sortField,
        sortDir,
        ...filters
    } = extractOrdersQueryParams(req.query);

    try {
        const filteredOrders = applyOrderFilters(db.orm.public.Order, filters);

        const orderedOrders = filteredOrders.orderBy([
            (o) => (sortDir === "asc" ? o[sortField].asc() : o[sortField].desc()),
            (o) => (sortDir === "asc" ? o.id.asc() : o.id.desc()),
        ]);

        const [rows, countResult] = await Promise.all([
            orderedOrders
                .select("id", "customer_id", "status", "order_date", "total_amount")
                .include("customer", (c) => c.select("id", "name", "email"))
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
            customer_name: row.customer?.name ?? null,
            customer_email: row.customer?.email ?? null,
            status: row.status,
            order_date: row.order_date,
            total_amount: row.total_amount,
            items_count: Number(row.order_items ?? 0),
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
        console.error("Error listing orders:", err);
        return res.status(500).json({ error: "Failed to fetch orders." });
    }
});


router.get("/:id", requireAuth, getOrderByIdValidators, async (req, res) => {
    const orderId = Number(req.params.id);

    try {
        const order = await db.orm.public.Order.where({ id: orderId })
            .select("id", "customer_id", "status", "order_date", "total_amount")
            .include("customer", (c) => c.select("id", "name", "email", "city", "createdAt"))
            .include("order_items", (oi) =>
                oi
                    .select("id", "order_id", "product_id", "quantity", "unit_price")
                    .include("product", (p) =>
                        p
                            .select("id", "name", "price", "category_id")
                            .include("category", (cat) => cat.select("id", "name"))
                    )
            )
            .first();

        if (!order) {
            return res.status(404).json({ error: "Order not found." });
        }

        const items = (order.order_items || []).map((item) => ({
            id: item.id,
            order_id: item.order_id,
            product_id: item.product_id,
            product_name: item.product?.name ?? null,
            category_id: item.product?.category_id ?? null,
            category_name: item.product?.category?.name ?? null,
            quantity: item.quantity,
            unit_price: item.unit_price,
            line_total: item.quantity * item.unit_price,
        }));

        return res.status(200).json({
            id: order.id,
            customer_id: order.customer_id,
            status: order.status,
            order_date: order.order_date,
            total_amount: order.total_amount,
            customer: order.customer
                ? {
                    id: order.customer.id,
                    name: order.customer.name,
                    email: order.customer.email,
                    city: order.customer.city,
                    created_at: order.customer.createdAt,
                }
                : null,
            items,
        });
    } catch (err) {
        console.error(`Error fetching order ${orderId}:`, err);
        return res.status(500).json({ error: "Failed to fetch order details." });
    }
});

export default router;
