import { Router } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import {
    importQueue,
    ALLOWED_TABLES,
    UPLOAD_DIR,
    ERROR_CSV_DIR,
} from "../services/import.service.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { logAudit } from "../services/audit.service.js";

const router = Router();

const ALLOWED_MIME_TYPES = [
    "text/csv",
    "application/csv",
    "application/vnd.ms-excel",
    "text/plain",
];

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, _file, cb) => cb(null, `${crypto.randomUUID()}.csv`),
});

const upload = multer({
    storage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB max per file
    fileFilter: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const isCsvExt = ext === ".csv";
        const isCsvMime = ALLOWED_MIME_TYPES.includes(file.mimetype);

        if (!isCsvExt && !isCsvMime) {
            const err = new Error("Only .csv files are allowed");
            err.statusCode = 400;
            return cb(err, false);
        }
        cb(null, true);
    },
});

const BUNDLE_FIELDS = ALLOWED_TABLES.map((name) => ({ name, maxCount: 1 }));

function cleanupUploadedFiles(filesObj) {
    if (!filesObj) return;
    for (const key of Object.keys(filesObj)) {
        const arr = filesObj[key] || [];
        for (const f of arr) {
            if (f?.path && fs.existsSync(f.path)) {
                fs.unlink(f.path, () => {});
            }
        }
    }
}

const uploadBundleMiddleware = (req, res, next) => {
    upload.fields(BUNDLE_FIELDS)(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            cleanupUploadedFiles(req.files);
            if (err.code === "LIMIT_FILE_SIZE") {
                return res.status(413).json({
                    error: "File too large. Maximum allowed size per CSV file is 100 MB.",
                });
            }
            return res.status(400).json({ error: `Upload error: ${err.message}` });
        }
        if (err) {
            cleanupUploadedFiles(req.files);
            return res.status(err.statusCode || 400).json({ error: err.message });
        }

        const missingTables = ALLOWED_TABLES.filter(
            (table) => !req.files?.[table]?.[0]
        );

        if (missingTables.length > 0) {
            cleanupUploadedFiles(req.files);
            return res.status(400).json({
                error: `All 5 CSV files are required together. Missing form-data file field(s): ${missingTables.join(", ")}`,
                required_fields: ALLOWED_TABLES,
                missing_fields: missingTables,
            });
        }

        next();
    });
};


const handleBulkBundleImport = async (req, res) => {
    const files = {
        categories: req.files.categories[0].path,
        products: req.files.products[0].path,
        customers: req.files.customers[0].path,
        orders: req.files.orders[0].path,
        order_items: req.files.order_items[0].path,
    };

    try {
        const jobId = crypto.randomUUID();
        await importQueue.add(
            "csv-bundle-import",
            {
                table: "bundle",
                files,
            },
            {
                jobId,
                removeOnComplete: false,
                removeOnFail: false,
            }
        );

        await logAudit({
            user_id: req.user?.id ?? null,
            actor_email: req.user?.email ?? null,
            action: "import_started",
            entity: "bundle",
            entity_id: jobId,
            details: `Bulk 5-CSV bundle import started (categories, products, customers, orders, order_items) (job_id: ${jobId})`,
        });

        return res.status(202).json({
            message: "All 5 CSV files queued for coordinated bundle import",
            job_id: jobId,
            table: "bundle",
            status: "running",
            status_url: `/import/jobs/${jobId}`,
        });
    } catch (err) {
        cleanupUploadedFiles(req.files);
        console.error("Failed to enqueue BullMQ bundle import job:", err);
        return res.status(500).json({ error: "Failed to queue bundle import job." });
    }
};

router.post("/bulk", requireAuth, requireAdmin, uploadBundleMiddleware, handleBulkBundleImport);

router.get("/jobs/:job_id", async (req, res) => {
    try {
        const bullJob = await importQueue.getJob(req.params.job_id);
        if (!bullJob) {
            return res.status(404).json({ error: "Import job not found" });
        }

        const state = await bullJob.getState();
        let status = "running";
        if (state === "completed") status = "done";
        else if (state === "failed") status = "failed";

        const counts =
            state === "completed" && bullJob.returnvalue
                ? bullJob.returnvalue
                : typeof bullJob.progress === "object" && bullJob.progress !== null
                    ? bullJob.progress
                    : {
                        total_rows: 0,
                        inserted: 0,
                        updated_or_skipped: 0,
                        failed: 0,
                        time_taken_seconds: 0,
                        error_csv_url: null,
                    };

        return res.status(200).json({
            job_id: bullJob.id,
            table: bullJob.data?.table || "bundle",
            status,
            ...counts,
            ...(state === "failed" ? { error_message: bullJob.failedReason } : {}),
        });
    } catch (err) {
        console.error("Error fetching job status:", err);
        return res.status(500).json({ error: "Failed to fetch job status" });
    }
});

router.get("/jobs/:job_id/errors", async (req, res) => {
    try {
        const bullJob = await importQueue.getJob(req.params.job_id);
        if (!bullJob) {
            return res.status(404).json({ error: "Import job not found" });
        }

        const errorCsvPath = path.join(ERROR_CSV_DIR, `${bullJob.id}_errors.csv`);
        if (!fs.existsSync(errorCsvPath)) {
            return res.status(404).json({ error: "No error CSV found for this job" });
        }

        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${bullJob.data?.table || "bundle"}_import_errors_${bullJob.id}.csv"`
        );

        const readStream = fs.createReadStream(errorCsvPath);
        readStream.pipe(res);
    } catch (err) {
        console.error("Error downloading error CSV:", err);
        return res.status(500).json({ error: "Failed to download error CSV" });
    }
});



export default router;
