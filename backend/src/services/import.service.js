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

function closeWriteStream(stream) {
    return new Promise((resolve) => {
        stream.end(() => resolve());
    });
}

async function writeErrorRow(errorStream, rawRow, reason, state, tableName = null) {
    if (!state.errorHeaderWritten) {
        const headerCols = tableName
            ? ["table", "row_id", "details", "error_reason"]
            : [...Object.keys(rawRow), "error_reason"];
        await writeCsvLine(errorStream, headerCols);
        state.errorHeaderWritten = true;
    }
    if (tableName) {
        const rowId = rawRow.id ?? "";
        const details = JSON.stringify(rawRow);
        await writeCsvLine(errorStream, [tableName, rowId, details, reason]);
    } else {
        const cols = [...Object.keys(rawRow).map((k) => rawRow[k] ?? ""), reason];
        await writeCsvLine(errorStream, cols);
    }
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
            return { csvId: id, data: { ...(id ? { id } : {}), name } };
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
            return { csvId: id, data: { ...(id ? { id } : {}), category_id, name, price } };
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
            return { csvId: id, data: { ...(id ? { id } : {}), name, email, city, createdAt } };
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
                csvId: id,
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
                csvId: id,
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


async function processBundleBatch(table, model, items, idMap, errorStream, state, tableMetrics) {
    if (items.length === 0) return;


    if (table === "categories" || table === "customers") {
        const uniqueField = table === "categories" ? "name" : "email";
        const seenInBatch = new Map();
        const dedupedItems = [];

        for (const item of items) {
            const keyVal = item.insertData[uniqueField];
            if (seenInBatch.has(keyVal)) {
                state.updated_or_skipped++;
                tableMetrics.updated_or_skipped++;
                await writeErrorRow(
                    errorStream,
                    item.rawRow,
                    `Duplicate ${uniqueField} '${keyVal}' within uploaded CSV`,
                    state,
                    table
                );
                continue;
            }
            seenInBatch.set(keyVal, item);
            dedupedItems.push(item);
        }

        if (dedupedItems.length === 0) return;

        const keyValues = dedupedItems.map((i) => i.insertData[uniqueField]);
        const existingRows = await model
            .where((m) => m[uniqueField].in(keyValues))
            .select("id", uniqueField)
            .all();

        const existingByKey = new Map(existingRows.map((r) => [r[uniqueField], r.id]));
        const toInsert = [];

        for (const item of dedupedItems) {
            const keyVal = item.insertData[uniqueField];
            if (existingByKey.has(keyVal)) {
                const existingDbId = existingByKey.get(keyVal);
                if (item.csvId !== undefined && idMap) {
                    idMap.set(item.csvId, existingDbId);
                }
                state.updated_or_skipped++;
                tableMetrics.updated_or_skipped++;
                await writeErrorRow(
                    errorStream,
                    item.rawRow,
                    `Existing ${table.slice(0, -1)} with ${uniqueField} '${keyVal}' mapped to DB id ${existingDbId} (skipped insert)`,
                    state,
                    table
                );
            } else {
                toInsert.push(item);
            }
        }

        if (toInsert.length === 0) return;

        try {
            const payload = toInsert.map((i) => i.insertData);
            const streamResult = await model.createAll(payload);
            const createdByKey = new Map();
            for await (const created of streamResult) {
                createdByKey.set(created[uniqueField], created.id);
            }

            for (const item of toInsert) {
                const dbId = createdByKey.get(item.insertData[uniqueField]);
                if (dbId !== undefined) {
                    if (item.csvId !== undefined && idMap) {
                        idMap.set(item.csvId, dbId);
                    }
                    state.inserted++;
                    tableMetrics.inserted++;
                } else {
                    state.failed++;
                    tableMetrics.failed++;
                    await writeErrorRow(errorStream, item.rawRow, "Failed to insert row", state, table);
                }
            }
        } catch (err) {
            for (const item of toInsert) {
                try {
                    const created = await model.create(item.insertData);
                    if (item.csvId !== undefined && idMap) {
                        idMap.set(item.csvId, created.id);
                    }
                    state.inserted++;
                    tableMetrics.inserted++;
                } catch (rowErr) {
                    state.failed++;
                    tableMetrics.failed++;
                    await writeErrorRow(errorStream, item.rawRow, rowErr.message || err.message, state, table);
                }
            }
        }
        return;
    }


    try {
        const payload = items.map((i) => i.insertData);
        const streamResult = await model.createAll(payload);
        const createdRows = [];
        for await (const created of streamResult) {
            createdRows.push(created);
        }

        for (let idx = 0; idx < items.length; idx++) {
            const item = items[idx];
            const created = createdRows[idx];
            if (created && created.id !== undefined) {
                if (item.csvId !== undefined && idMap) {
                    idMap.set(item.csvId, created.id);
                }
                state.inserted++;
                tableMetrics.inserted++;
            } else {
                state.failed++;
                tableMetrics.failed++;
                await writeErrorRow(errorStream, item.rawRow, "Row was not inserted", state, table);
            }
        }
    } catch (batchErr) {
        for (const item of items) {
            try {
                const created = await model.create(item.insertData);
                if (item.csvId !== undefined && idMap) {
                    idMap.set(item.csvId, created.id);
                }
                state.inserted++;
                tableMetrics.inserted++;
            } catch (rowErr) {
                state.failed++;
                tableMetrics.failed++;
                await writeErrorRow(errorStream, item.rawRow, rowErr.message || batchErr.message, state, table);
            }
        }
    }
}


async function processBundleImport(bullJob) {
    const { files } = bullJob.data;
    const startTime = performance.now();
    const errorCsvPath = path.join(ERROR_CSV_DIR, `${bullJob.id}_errors.csv`);
    const errorStream = fs.createWriteStream(errorCsvPath);

    const state = {
        total_rows: 0,
        inserted: 0,
        updated_or_skipped: 0,
        failed: 0,
        errorHeaderWritten: false,
        breakdown: {
            categories: { total_rows: 0, inserted: 0, updated_or_skipped: 0, failed: 0 },
            products: { total_rows: 0, inserted: 0, updated_or_skipped: 0, failed: 0 },
            customers: { total_rows: 0, inserted: 0, updated_or_skipped: 0, failed: 0 },
            orders: { total_rows: 0, inserted: 0, updated_or_skipped: 0, failed: 0 },
            order_items: { total_rows: 0, inserted: 0, updated_or_skipped: 0, failed: 0 },
        },
    };

    const categoryMap = new Map();
    const productMap = new Map();
    const customerMap = new Map();
    const orderMap = new Map();

    const reportProgress = async (currentStep) => {
        await bullJob.updateProgress({
            current_table: currentStep,
            total_rows: state.total_rows,
            inserted: state.inserted,
            updated_or_skipped: state.updated_or_skipped,
            failed: state.failed,
            breakdown: state.breakdown,
            time_taken_seconds: Number(((performance.now() - startTime) / 1000).toFixed(2)),
        });
    };

    const importTableWithMapping = async (table, filePath, idMap, preRowCheck) => {
        const model = MODEL_MAP[table]();
        const tableMetrics = state.breakdown[table];
        const seenCsvIds = new Set();
        let batch = [];

        const readStream = fs.createReadStream(filePath).pipe(csv());
        for await (const rawRow of readStream) {
            state.total_rows++;
            tableMetrics.total_rows++;

            const result = validateAndTransformRow(table, rawRow);
            if (result.error) {
                state.failed++;
                tableMetrics.failed++;
                await writeErrorRow(errorStream, rawRow, result.error, state, table);
                continue;
            }

            if (result.csvId !== undefined) {
                if (seenCsvIds.has(result.csvId)) {
                    state.updated_or_skipped++;
                    tableMetrics.updated_or_skipped++;
                    await writeErrorRow(
                        errorStream,
                        rawRow,
                        `Duplicate CSV id ${result.csvId} in ${table}.csv`,
                        state,
                        table
                    );
                    continue;
                }
                seenCsvIds.add(result.csvId);
            }

            // Strip `id` so PostgreSQL uses its autoincrement sequence
            const { id: _unusedId, ...insertData } = result.data;

            if (preRowCheck) {
                const checkErr = preRowCheck(result.csvId, insertData);
                if (checkErr) {
                    state.failed++;
                    tableMetrics.failed++;
                    await writeErrorRow(errorStream, rawRow, checkErr, state, table);
                    continue;
                }
            }

            batch.push({
                csvId: result.csvId,
                insertData,
                rawRow,
            });

            if (batch.length >= BATCH_SIZE) {
                await processBundleBatch(table, model, batch, idMap, errorStream, state, tableMetrics);
                batch = [];
                await reportProgress(table);
            }
        }

        if (batch.length > 0) {
            await processBundleBatch(table, model, batch, idMap, errorStream, state, tableMetrics);
            batch = [];
            await reportProgress(table);
        }
    };

    try {
        // 1. Categories
        await importTableWithMapping("categories", files.categories, categoryMap, null);

        // 2. Products (remap category_id using categoryMap)
        await importTableWithMapping("products", files.products, productMap, (_csvId, insertData) => {
            const realCategoryId = categoryMap.get(insertData.category_id);
            if (!realCategoryId) {
                return `Referenced category_id ${insertData.category_id} does not exist or failed validation in categories.csv`;
            }
            insertData.category_id = realCategoryId;
            return null;
        });

        // 3. Customers
        await importTableWithMapping("customers", files.customers, customerMap, null);

        // 4. Pre-scan order_items.csv to calculate sum(quantity * unit_price) per CSV order_id
        // so we can validate orders.total_amount before inserting any orders!
        const orderExpectedTotals = new Map();
        const orderValidItemCounts = new Map();
        const preScanStream = fs.createReadStream(files.order_items).pipe(csv());

        for await (const rawItem of preScanStream) {
            const parsed = validateAndTransformRow("order_items", rawItem);
            if (parsed.error) {
                continue;
            }
            const { order_id, product_id, quantity, unit_price } = parsed.data;
            // Only count items whose product_id actually succeeded in products.csv
            if (!productMap.has(product_id)) {
                continue;
            }
            const lineTotal = quantity * unit_price;
            orderExpectedTotals.set(order_id, (orderExpectedTotals.get(order_id) || 0) + lineTotal);
            orderValidItemCounts.set(order_id, (orderValidItemCounts.get(order_id) || 0) + 1);
        }

        // 5. Orders (remap customer_id AND validate total_amount === sum(quantity * unit_price))
        await importTableWithMapping("orders", files.orders, orderMap, (csvOrderId, insertData) => {
            const realCustomerId = customerMap.get(insertData.customer_id);
            if (!realCustomerId) {
                return `Referenced customer_id ${insertData.customer_id} does not exist or failed validation in customers.csv`;
            }
            if (csvOrderId === undefined) {
                return "Order row in bundle import must include a CSV 'id' to link with order_items.csv";
            }

            const validItemsCount = orderValidItemCounts.get(csvOrderId) || 0;
            if (validItemsCount === 0) {
                return `Order ${csvOrderId} has no valid order_items in order_items.csv`;
            }

            const expectedTotal = orderExpectedTotals.get(csvOrderId) || 0;
            if (insertData.total_amount !== expectedTotal) {
                return `Order total_amount mismatch: order has total_amount=${insertData.total_amount}, but sum(quantity * unit_price) of valid order_items is ${expectedTotal}`;
            }

            insertData.customer_id = realCustomerId;
            return null;
        });

        // 6. Order Items (remap order_id and product_id)
        await importTableWithMapping("order_items", files.order_items, null, (_csvId, insertData) => {
            const realOrderId = orderMap.get(insertData.order_id);
            if (!realOrderId) {
                return `Referenced order_id ${insertData.order_id} was rejected or does not exist in orders.csv`;
            }
            const realProductId = productMap.get(insertData.product_id);
            if (!realProductId) {
                return `Referenced product_id ${insertData.product_id} was rejected or does not exist in products.csv`;
            }
            insertData.order_id = realOrderId;
            insertData.product_id = realProductId;
            return null;
        });

        await closeWriteStream(errorStream);

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
            breakdown: state.breakdown,
            time_taken_seconds,
            error_csv_url,
        };

        await bullJob.updateProgress(finalSummary);
        return finalSummary;
    } catch (err) {
        await closeWriteStream(errorStream);
        throw err;
    } finally {
        for (const key of Object.keys(files || {})) {
            const fp = files[key];
            if (fp && fs.existsSync(fp)) {
                fs.unlink(fp, () => {});
            }
        }
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
        if (bullJob.name === "csv-bundle-import" || bullJob.data?.files) {
            return processBundleImport(bullJob);
        }

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

            await closeWriteStream(errorStream);

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
            await closeWriteStream(errorStream);
            throw err;
        } finally {
            if (filePath && fs.existsSync(filePath)) {
                fs.unlink(filePath, () => {});
            }
        }
    },
    {
        connection: redisConnection,
        concurrency: 1,
    }
);
