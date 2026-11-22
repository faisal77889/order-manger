import fs from "fs";
import path from "path";
import csv from "csv-parser";
import { Queue, Worker } from "bullmq";
import { redisConnection } from "../config/redis.js";
import { db } from "../prisma/db.ts";

const projectRoot = path.resolve(import.meta.dirname, "../..");
export const UPLOAD_DIR = path.join(projectRoot, "uploads");
export const ERROR_CSV_DIR = path.join(UPLOAD_DIR, "errors");

if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(ERROR_CSV_DIR)) {
    fs.mkdirSync(ERROR_CSV_DIR, { recursive: true });
}

export const ALLOWED_TABLES = ["categories", "products", "customers", "orders", "order_items"];
const ALLOWED_STATUSES = new Set(["pending", "paid", "shipped", "cancelled"]);
const BATCH_SIZE = 2500;

export const MODEL_MAP = {
    categories: () => db.orm.public.Category,
    products: () => db.orm.public.Product,
    customers: () => db.orm.public.Customer,
    orders: () => db.orm.public.Order,
    order_items: () => db.orm.public.OrderItem,
};

function csvEscape(val) {
    if (val === null || val === undefined) return "";
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function writeCsvLine(stream, fields) {
    const line = fields.map(csvEscape).join(",") + "\n";
    if (!stream.write(line)) {
        return new Promise((resolve) => stream.once("drain", resolve));
    }
    return Promise.resolve();
}

async function writeErrorRow(errorStream, rawRow, reason, state) {
    if (!state.errorHeaderWritten) {
        const headerCols = [...Object.keys(rawRow), "error_reason"];
        await writeCsvLine(errorStream, headerCols);
        state.errorHeaderWritten = true;
    }
    const cols = [...Object.keys(rawRow).map((k) => rawRow[k] ?? ""), reason];
    await writeCsvLine(errorStream, cols);
}

function parseAmountToInt(raw) {
    const num = Number(raw);
    if (!Number.isFinite(num)) return NaN;
    return Math.round(num);
}

export function validateAndTransformRow(table, row) {
    switch (table) {
        case "categories": {
            const name = (row.name || "").trim();
            if (!name) return { error: "Missing category name" };
            const id = row.id ? parseInt(row.id, 10) : undefined;
            if (row.id !== undefined && (!Number.isInteger(id) || id <= 0)) {
                return { error: "Invalid id" };
            }
            return { data: { ...(id ? { id } : {}), name } };
        }

        case "products": {
            const name = (row.name || "").trim();
            if (!name) return { error: "Missing product name" };
            const category_id = parseInt(row.category_id, 10);
            if (!Number.isInteger(category_id) || category_id <= 0) {
                return { error: `Invalid category_id: ${row.category_id}` };
            }
            const rawPrice = Number(row.price);
            if (row.price === "" || row.price === undefined || !Number.isFinite(rawPrice) || rawPrice < 0) {
                return { error: `Invalid or negative price: ${row.price}` };
            }
            const price = parseAmountToInt(row.price);
            const id = row.id ? parseInt(row.id, 10) : undefined;
            if (row.id !== undefined && (!Number.isInteger(id) || id <= 0)) {
                return { error: "Invalid id" };
            }
            return { data: { ...(id ? { id } : {}), category_id, name, price } };
        }

        case "customers": {
            const name = (row.name || "").trim();
            if (!name) return { error: "Missing customer name" };
            const email = (row.email || "").trim().toLowerCase();
            if (!email || !email.includes("@")) {
                return { error: "Missing or invalid email" };
            }
            const city = (row.city || "").trim();
            if (!city) return { error: "Missing city" };

            let createdAt = new Date();
            if (row.created_at || row.createdAt) {
                const parsedDate = new Date(row.created_at || row.createdAt);
                if (isNaN(parsedDate.getTime())) {
                    return { error: `Invalid created_at date format: ${row.created_at || row.createdAt}` };
                }
                createdAt = parsedDate;
            }

            const id = row.id ? parseInt(row.id, 10) : undefined;
            if (row.id !== undefined && (!Number.isInteger(id) || id <= 0)) {
                return { error: "Invalid id" };
            }
            return { data: { ...(id ? { id } : {}), name, email, city, createdAt } };
        }

        case "orders": {
            const customer_id = parseInt(row.customer_id, 10);
            if (!Number.isInteger(customer_id) || customer_id <= 0) {
                return { error: `Invalid customer_id: ${row.customer_id}` };
            }
            const status = (row.status || "").trim();
            if (!ALLOWED_STATUSES.has(status)) {
                return { error: `Invalid status: ${row.status}` };
            }
            const order_date = new Date(row.order_date);
            if (!row.order_date || isNaN(order_date.getTime())) {
                return { error: `Wrong date format: ${row.order_date}` };
            }
            const rawTotal = Number(row.total_amount);
            if (row.total_amount === "" || !Number.isFinite(rawTotal) || rawTotal < 0) {
                return { error: `Invalid or negative total_amount: ${row.total_amount}` };
            }
            const total_amount = parseAmountToInt(row.total_amount);
            const id = row.id ? parseInt(row.id, 10) : undefined;
            if (row.id !== undefined && (!Number.isInteger(id) || id <= 0)) {
                return { error: "Invalid id" };
            }
            return {
                data: {
                    ...(id ? { id } : {}),
                    customer_id,
                    status,
                    order_date,
                    total_amount,
                },
            };
        }

        case "order_items": {
            const order_id = parseInt(row.order_id, 10);
            if (!Number.isInteger(order_id) || order_id <= 0) {
                return { error: `Invalid order_id: ${row.order_id}` };
            }
            const product_id = parseInt(row.product_id, 10);
            if (!Number.isInteger(product_id) || product_id <= 0) {
                return { error: `Invalid product_id: ${row.product_id}` };
            }
            const quantity = Number(row.quantity);
            if (!Number.isInteger(quantity) || quantity <= 0) {
                return { error: `Quantity must be an integer > 0 (got ${row.quantity})` };
            }
            const rawUnitPrice = Number(row.unit_price);
            if (row.unit_price === "" || !Number.isFinite(rawUnitPrice) || rawUnitPrice <= 0) {
                return { error: `Unit price must be > 0 (got ${row.unit_price})` };
            }
            const unit_price = Math.max(1, parseAmountToInt(row.unit_price));
            const id = row.id ? parseInt(row.id, 10) : undefined;
            if (row.id !== undefined && (!Number.isInteger(id) || id <= 0)) {
                return { error: "Invalid id" };
            }
            return {
                data: {
                    ...(id ? { id } : {}),
                    order_id,
                    product_id,
                    quantity,
                    unit_price,
                },
            };
        }

        default:
            return { error: `Unsupported table: ${table}` };
    }
}

async function processBatch(table, model, items, errorStream, state) {
    if (items.length === 0) return;

    const payload = items.map((i) => i.data);

    try {
        const streamResult = await model.createAll(payload, { onConflict: "skip" });

        const insertedKeys = new Set();
        for await (const row of streamResult) {
            if (row.id !== undefined) {
                insertedKeys.add(`id:${row.id}`);
            }
            if (row.name !== undefined) {
                insertedKeys.add(`name:${row.name}`);
            }
            if (row.email !== undefined) {
                insertedKeys.add(`email:${row.email}`);
            }
        }

        const skipped_transaction = [];
        for (const item of items) {
            let matched = false;
            if (item.data.id !== undefined && insertedKeys.has(`id:${item.data.id}`)) {
                matched = true;
            } else if (item.data.name !== undefined && insertedKeys.has(`name:${item.data.name}`)) {
                matched = true;
            } else if (item.data.email !== undefined && insertedKeys.has(`email:${item.data.email}`)) {
                matched = true;
            }

            if (matched) {
                state.inserted++;
            } else {
                skipped_transaction.push(item);
            }
        }

        for (const item of skipped_transaction) {
            try {
                await model.create(item.data);
                state.inserted++;
            } catch (err) {
                const isDuplicate = err.message && err.message.includes("duplicate key value");
                if (isDuplicate) {
                    state.updated_or_skipped++;
                } else {
                    state.failed++;
                }
                await writeErrorRow(errorStream, item.rawRow, err.message, state);
            }
        }
    } catch (batchErr) {
        for (const item of items) {
            try {
                await model.create(item.data);
                state.inserted++;
            } catch (rowErr) {
                const isDuplicate = rowErr.message && rowErr.message.includes("duplicate key value");
                if (isDuplicate) {
                    state.updated_or_skipped++;
                } else {
                    state.failed++;
                }
                await writeErrorRow(errorStream, item.rawRow, rowErr.message || batchErr.message, state);
            }
        }
    }
}

export { redisConnection };

export const importQueue = new Queue("csv-import-queue", {
    connection: redisConnection,
});

export const importWorker = new Worker(
    "csv-import-queue",
    async (bullJob) => {
        const { table, filePath } = bullJob.data;
        const startTime = performance.now();
        const errorCsvPath = path.join(ERROR_CSV_DIR, `${bullJob.id}_errors.csv`);
        const errorStream = fs.createWriteStream(errorCsvPath);

        const state = {
            total_rows: 0,
            inserted: 0,
            updated_or_skipped: 0,
            failed: 0,
            errorHeaderWritten: false,
        };

        const model = MODEL_MAP[table]();
        let batch = [];

        try {
            const readStream = fs.createReadStream(filePath).pipe(csv());

            for await (const rawRow of readStream) {
                state.total_rows++;

                const result = validateAndTransformRow(table, rawRow);

                if (result.error) {
                    state.failed++;
                    await writeErrorRow(errorStream, rawRow, result.error, state);
                    continue;
                }

                batch.push({
                    data: result.data,
                    rawRow,
                });

                if (batch.length >= BATCH_SIZE) {
                    await processBatch(table, model, batch, errorStream, state);
                    batch = [];

                    await bullJob.updateProgress({
                        total_rows: state.total_rows,
                        inserted: state.inserted,
                        updated_or_skipped: state.updated_or_skipped,
                        failed: state.failed,
                        time_taken_seconds: Number(((performance.now() - startTime) / 1000).toFixed(2)),
                    });
                }
            }

            if (batch.length > 0) {
                await processBatch(table, model, batch, errorStream, state);
                batch = [];
            }

            errorStream.end();

            // Advance Postgres sequence if IDs were imported
            try {
                await db.execute(
                    db.raw.sql`SELECT setval(pg_get_serial_sequence(${table}, 'id'), COALESCE((SELECT MAX(id) FROM ${db.raw.sql([table])}), 1), true)`
                        .affectedCount()
                        .build()
                );
            } catch {
                // Sequence update is best-effort
            }

            const time_taken_seconds = Number(((performance.now() - startTime) / 1000).toFixed(2));
            const hasErrors = state.failed > 0 || state.updated_or_skipped > 0;
            const error_csv_url = hasErrors ? `/import/jobs/${bullJob.id}/errors` : null;

            if (!hasErrors && fs.existsSync(errorCsvPath)) {
                fs.unlinkSync(errorCsvPath);
            }

            const finalSummary = {
                total_rows: state.total_rows,
                inserted: state.inserted,
                updated_or_skipped: state.updated_or_skipped,
                failed: state.failed,
                time_taken_seconds,
                error_csv_url,
            };

            await bullJob.updateProgress(finalSummary);
            return finalSummary;
        } catch (err) {
            errorStream.end();
            throw err;
        } finally {
            if (filePath && fs.existsSync(filePath)) {
                fs.unlink(filePath, () => { });
            }
        }
    },
    {
        connection: redisConnection,
        concurrency: 1,
    }
);
