import { Router } from "express";
import { query, validationResult } from "express-validator";
import { db } from "../prisma/db.ts";
import { requireAuth } from "../middleware/auth.js";

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

const topCustomersValidators = [
    query("limit")
        .optional({ values: "falsy" })
        .isInt({ min: 1, max: 100 })
        .withMessage("Invalid 'limit' parameter. Must be an integer between 1 and 100.")
        .toInt(),
    handleValidationErrors,
];


async function queryRows(plan) {
    const rows = [];
    for await (const row of db.query(plan)) {
        rows.push(row);
    }
    return rows;
}

router.get("/sales-by-category", requireAuth, async (_req, res) => {
    try {
        const plan = db.raw.sql`
            SELECT
                c.id AS category_id,
                c.name AS category_name,
                COALESCE(SUM(oi.quantity), 0)::int AS total_quantity_sold,
                COALESCE(SUM(oi.quantity::bigint * oi.unit_price::bigint), 0)::bigint AS total_revenue
            FROM categories c
            LEFT JOIN products p ON p.category_id = c.id
            LEFT JOIN order_items oi ON oi.product_id = p.id
            GROUP BY c.id, c.name
            ORDER BY total_revenue DESC, c.id ASC
        `
            .returnsRow({
                category_id: "pg/int4@1",
                category_name: "pg/text@1",
                total_quantity_sold: "pg/int4@1",
                total_revenue: "pg/int8number@1",
            })
            .build();

        const rows = await queryRows(plan);
        const items = rows.map((row) => ({
            category_id: row.category_id,
            category_name: row.category_name,
            total_quantity_sold: Number(row.total_quantity_sold),
            total_revenue: Number(row.total_revenue),
        }));

        return res.status(200).json({ items });
    } catch (err) {
        console.error("Error generating sales-by-category report:", err);
        return res.status(500).json({ error: "Failed to generate sales-by-category report." });
    }
});

router.get("/top-customers", requireAuth, topCustomersValidators, async (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 10;

    try {
        const plan = db.raw.sql`
            SELECT
                c.id AS customer_id,
                c.name AS customer_name,
                c.email AS customer_email,
                c.city AS customer_city,
                COUNT(o.id)::int AS order_count,
                COALESCE(SUM(o.total_amount::bigint), 0)::bigint AS total_spent
            FROM customers c
            INNER JOIN orders o ON o.customer_id = c.id
            WHERE o.status IN ('paid', 'shipped')
            GROUP BY c.id, c.name, c.email, c.city
            ORDER BY total_spent DESC, order_count DESC, c.id ASC
            LIMIT ${limit}
        `
            .returnsRow({
                customer_id: "pg/int4@1",
                customer_name: "pg/text@1",
                customer_email: "pg/text@1",
                customer_city: "pg/text@1",
                order_count: "pg/int4@1",
                total_spent: "pg/int8number@1",
            })
            .build();

        const rows = await queryRows(plan);
        const items = rows.map((row) => ({
            customer_id: row.customer_id,
            customer_name: row.customer_name,
            customer_email: row.customer_email,
            customer_city: row.customer_city,
            order_count: Number(row.order_count),
            total_spent: Number(row.total_spent),
        }));

        return res.status(200).json({
            limit,
            items,
        });
    } catch (err) {
        console.error("Error generating top-customers report:", err);
        return res.status(500).json({ error: "Failed to generate top-customers report." });
    }
});


router.get("/never-ordered-products", requireAuth, async (_req, res) => {
    try {
        const plan = db.raw.sql`
            SELECT
                p.id AS product_id,
                p.name AS product_name,
                p.price AS price,
                p.category_id AS category_id,
                c.name AS category_name
            FROM products p
            INNER JOIN categories c ON c.id = p.category_id
            LEFT JOIN order_items oi ON oi.product_id = p.id
            WHERE oi.id IS NULL
            ORDER BY p.id ASC
        `
            .returnsRow({
                product_id: "pg/int4@1",
                product_name: "pg/text@1",
                price: "pg/int4@1",
                category_id: "pg/int4@1",
                category_name: "pg/text@1",
            })
            .build();

        const rows = await queryRows(plan);
        const items = rows.map((row) => ({
            product_id: row.product_id,
            product_name: row.product_name,
            price: Number(row.price),
            category_id: row.category_id,
            category_name: row.category_name,
        }));

        return res.status(200).json({
            total: items.length,
            items,
        });
    } catch (err) {
        console.error("Error generating never-ordered-products report:", err);
        return res.status(500).json({ error: "Failed to generate never-ordered-products report." });
    }
});


router.get("/monthly-sales", requireAuth, async (_req, res) => {
    try {
        const plan = db.raw.sql`
            SELECT
                TO_CHAR(DATE_TRUNC('month', o.order_date), 'YYYY-MM') AS month,
                COUNT(o.id)::int AS order_count,
                COALESCE(SUM(o.total_amount::bigint), 0)::bigint AS revenue
            FROM orders o
            WHERE o.order_date >= DATE_TRUNC('month', (SELECT COALESCE(MAX(order_date), NOW()) FROM orders)) - INTERVAL '11 months'
            GROUP BY DATE_TRUNC('month', o.order_date)
            ORDER BY DATE_TRUNC('month', o.order_date) ASC
        `
            .returnsRow({
                month: "pg/text@1",
                order_count: "pg/int4@1",
                revenue: "pg/int8number@1",
            })
            .build();

        const rows = await queryRows(plan);
        const items = rows.map((row) => ({
            month: row.month,
            order_count: Number(row.order_count),
            revenue: Number(row.revenue),
        }));

        return res.status(200).json({ items });
    } catch (err) {
        console.error("Error generating monthly-sales report:", err);
        return res.status(500).json({ error: "Failed to generate monthly-sales report." });
    }
});

export default router;
