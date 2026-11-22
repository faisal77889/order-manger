import { Router } from "express";
import { query, param, body, validationResult } from "express-validator";
import { db } from "../prisma/db.ts";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { logAudit } from "../services/audit.service.js";

const router = Router();

const ALLOWED_STATUSES = ["pending", "paid", "shipped", "cancelled"];
const ALLOWED_SORT_DIRS = ["asc", "desc"];


const ALLOWED_STATUS_TRANSITIONS = {
    pending: ["paid", "cancelled"],
    paid: ["shipped", "cancelled"],
    shipped: ["cancelled"],
    cancelled: [],
};


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

const createOrderValidators = [
    body("customer_id")
        .exists({ values: "null" })
        .withMessage("'customer_id' is required.")
        .isInt({ min: 1 })
        .withMessage("Invalid 'customer_id'. Must be a positive integer.")
        .toInt(),
    body("status")
        .optional({ values: "falsy" })
        .trim()
        .toLowerCase()
        .isIn(ALLOWED_STATUSES)
        .withMessage(`Invalid 'status'. Allowed values: ${ALLOWED_STATUSES.join(", ")}.`),
    body("order_date")
        .optional({ values: "falsy" })
        .trim()
        .custom((val) => !isNaN(new Date(val).getTime()))
        .withMessage("Invalid 'order_date'. Must be a valid date format."),
    body("items")
        .isArray({ min: 1 })
        .withMessage("'items' must be a non-empty array of order items."),
    body("items.*.product_id")
        .exists({ values: "null" })
        .withMessage("Each item must have a 'product_id'.")
        .isInt({ min: 1 })
        .withMessage("Each item 'product_id' must be a positive integer.")
        .toInt(),
    body("items.*.quantity")
        .exists({ values: "null" })
        .withMessage("Each item must have a 'quantity'.")
        .isInt({ min: 1 })
        .withMessage("Each item 'quantity' must be a positive integer (> 0).")
        .toInt(),
    body("items.*.unit_price")
        .optional({ values: "null" })
        .isFloat({ gt: 0 })
        .withMessage("Each item 'unit_price' must be a positive number (> 0)."),
    body("items.*.price")
        .optional({ values: "null" })
        .isFloat({ gt: 0 })
        .withMessage("Each item 'price' must be a positive number (> 0)."),
    handleValidationErrors,
];

const updateOrderStatusValidators = [
    param("id")
        .isInt({ min: 1 })
        .withMessage("Invalid order 'id'. Must be a positive integer.")
        .toInt(),
    body("status")
        .exists({ values: "falsy" })
        .withMessage("'status' is required.")
        .trim()
        .toLowerCase()
        .isIn(ALLOWED_STATUSES)
        .withMessage(`Invalid 'status'. Allowed values: ${ALLOWED_STATUSES.join(", ")}.`),
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


router.post("/", requireAuth, requireAdmin, createOrderValidators, async (req, res) => {
    const customerId = Number(req.body.customer_id);
    const status = req.body.status ? String(req.body.status).trim().toLowerCase() : "pending";
    const orderDate = req.body.order_date ? new Date(req.body.order_date) : new Date();
    const rawItems = req.body.items;

    try {

        const customer = await db.orm.public.Customer.where({ id: customerId })
            .select("id", "name", "email")
            .first();

        if (!customer) {
            return res.status(404).json({
                error: `Customer with id ${customerId} does not exist. Please create a customer first before placing an order.`,
            });
        }


        const productIds = [...new Set(rawItems.map((i) => Number(i.product_id)))];
        const products = await db.orm.public.Product.where((p) => p.id.in(productIds))
            .select("id", "name", "price")
            .all();

        const productMap = new Map(products.map((p) => [p.id, p]));
        for (const pid of productIds) {
            if (!productMap.has(pid)) {
                return res.status(400).json({
                    error: `Product with id ${pid} does not exist.`,
                });
            }
        }


        let totalAmount = 0;
        const preparedItems = [];

        for (const item of rawItems) {
            const productId = Number(item.product_id);
            const quantity = Number(item.quantity);
            const product = productMap.get(productId);

            const rawPrice =
                item.unit_price !== undefined
                    ? Number(item.unit_price)
                    : item.price !== undefined
                        ? Number(item.price)
                        : Number(product.price);

            const unitPrice = Math.round(rawPrice);

            if (!Number.isInteger(quantity) || quantity <= 0) {
                return res.status(400).json({
                    error: "Quantity must be a positive integer (> 0).",
                });
            }

            if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
                return res.status(400).json({
                    error: `Unit price for product ${productId} must be positive (> 0).`,
                });
            }

            totalAmount += quantity * unitPrice;
            preparedItems.push({
                product_id: productId,
                quantity,
                unit_price: unitPrice,
            });
        }


        const result = await db.transaction(async (tx) => {
            const newOrder = await tx.orm.public.Order.create({
                customer_id: customerId,
                status,
                order_date: orderDate,
                total_amount: totalAmount,
            });

            const orderItemsPayload = preparedItems.map((item) => ({
                order_id: newOrder.id,
                product_id: item.product_id,
                quantity: item.quantity,
                unit_price: item.unit_price,
            }));

            const createdItems = await tx.orm.public.OrderItem.createAll(orderItemsPayload);

            return {
                order: newOrder,
                items: createdItems,
            };
        });

        await logAudit({
            user_id: req.user?.id ?? null,
            actor_email: req.user?.email ?? null,
            action: "order_created",
            entity: "orders",
            entity_id: result.order.id,
            details: `Order #${result.order.id} created for customer #${customerId} (${preparedItems.length} items, total_amount: ${totalAmount})`,
        });

        return res.status(201).json({
            message: "Order created successfully.",
            id: result.order.id,
            customer_id: result.order.customer_id,
            customer_name: customer.name,
            status: result.order.status,
            order_date: result.order.order_date,
            total_amount: result.order.total_amount,
            items: result.items.map((item) => ({
                id: item.id,
                order_id: item.order_id,
                product_id: item.product_id,
                product_name: productMap.get(item.product_id)?.name ?? null,
                quantity: item.quantity,
                unit_price: item.unit_price,
                line_total: item.quantity * item.unit_price,
            })),
        });
    } catch (err) {
        console.error("Error creating order:", err);
        return res.status(500).json({ error: "Failed to create order." });
    }
});


router.patch(
    "/:id/status",
    requireAuth,
    requireAdmin,
    updateOrderStatusValidators,
    async (req, res) => {
        const orderId = Number(req.params.id);
        const newStatus = String(req.body.status).trim().toLowerCase();

        try {
            const existingOrder = await db.orm.public.Order.where({ id: orderId })
                .select("id", "customer_id", "status", "order_date", "total_amount")
                .first();

            if (!existingOrder) {
                return res.status(404).json({ error: "Order not found." });
            }

            const currentStatus = existingOrder.status;

            if (currentStatus === "cancelled") {
                return res.status(400).json({
                    error: "Cannot change status of a cancelled order.",
                });
            }

            if (currentStatus === newStatus) {
                return res.status(400).json({
                    error: `Order status is already '${currentStatus}'.`,
                });
            }

            const allowedNextStatuses = ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];
            if (!allowedNextStatuses.includes(newStatus)) {
                return res.status(400).json({
                    error: `Invalid status transition from '${currentStatus}' to '${newStatus}'. Allowed transitions from '${currentStatus}': ${allowedNextStatuses.length > 0 ? allowedNextStatuses.join(", ") : "none"
                        }.`,
                });
            }

            const updatedOrder = await db.orm.public.Order.where({ id: orderId }).update({
                status: newStatus,
            });

            await logAudit({
                user_id: req.user?.id ?? null,
                actor_email: req.user?.email ?? null,
                action: "order_status_changed",
                entity: "orders",
                entity_id: orderId,
                details: `Order #${orderId} status changed from '${currentStatus}' to '${newStatus}'`,
            });

            return res.status(200).json({
                message: `Order status updated from '${currentStatus}' to '${newStatus}'.`,
                order: updatedOrder,
            });
        } catch (err) {
            console.error(`Error updating status for order ${orderId}:`, err);
            return res.status(500).json({ error: "Failed to update order status." });
        }
    }
);


router.delete("/:id", requireAuth, requireAdmin, getOrderByIdValidators, async (req, res) => {
    const orderId = Number(req.params.id);

    try {
        const existingOrder = await db.orm.public.Order.where({ id: orderId })
            .select("id", "customer_id", "status", "total_amount")
            .first();

        if (!existingOrder) {
            return res.status(404).json({ error: "Order not found." });
        }

        const deletedItemsCount = await db.transaction(async (tx) => {
            const count = await tx.orm.public.OrderItem.where({
                order_id: orderId,
            }).deleteAndCount();

            await tx.orm.public.Order.where({ id: orderId }).delete();

            return count;
        });

        await logAudit({
            user_id: req.user?.id ?? null,
            actor_email: req.user?.email ?? null,
            action: "order_deleted",
            entity: "orders",
            entity_id: orderId,
            details: `Order #${orderId} deleted along with ${deletedItemsCount} order items`,
        });

        return res.status(200).json({
            message: "Order and its items deleted successfully.",
            deleted_order_id: orderId,
            deleted_items_count: deletedItemsCount,
        });
    } catch (err) {
        console.error(`Error deleting order ${orderId}:`, err);
        return res.status(500).json({ error: "Failed to delete order." });
    }
});

export default router;
