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

const router = Router();

// 1. Upload Safety (Section 4.7)
// - Accept only .csv (check extension and content type)
// - Max file size 100 MB (reject bigger files with 413)
// - Save with generated random name (never use uploaded file name as a path)
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
    limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB max
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

const uploadCsvMiddleware = (req, res, next) => {
    upload.single("file")(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            if (err.code === "LIMIT_FILE_SIZE") {
                return res.status(413).json({
                    error: "File too large. Maximum allowed size is 100 MB.",
                });
            }
            return res.status(400).json({ error: `Upload error: ${err.message}` });
        }
        if (err) {
            return res.status(err.statusCode || 400).json({ error: err.message });
        }

        if (!req.file) {
            return res.status(400).json({
                error: 'No CSV file uploaded. Please upload a .csv file in form-data field "file".',
            });
        }
        next();
    });
};

// POST /import/:table - Enqueue bulk import job in BullMQ (Section 4.1)
router.post("/:table", uploadCsvMiddleware, async (req, res) => {
    const { table } = req.params;

    if (!ALLOWED_TABLES.includes(table)) {
        if (req.file?.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        return res.status(400).json({
            error: `Invalid table "${table}". Allowed tables: ${ALLOWED_TABLES.join(", ")}`,
        });
    }

    try {
        const jobId = crypto.randomUUID();
        await importQueue.add(
            "csv-import",
            {
                table,
                filePath: req.file.path,
            },
            {
                jobId,
                removeOnComplete: false,
                removeOnFail: false,
            }
        );

        return res.status(202).json({
            message: `Import job queued for ${table}`,
            job_id: jobId,
            status: "running",
            status_url: `/import/jobs/${jobId}`,
        });
    } catch (err) {
        console.error("Failed to enqueue BullMQ import job:", err);
        return res.status(500).json({ error: "Failed to queue import job." });
    }
});

// GET /import/jobs/:job_id - Check job status and progress in BullMQ (Section 4.1)
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
            table: bullJob.data?.table,
            status,
            ...counts,
            ...(state === "failed" ? { error_message: bullJob.failedReason } : {}),
        });
    } catch (err) {
        console.error("Error fetching job status:", err);
        return res.status(500).json({ error: "Failed to fetch job status" });
    }
});

// GET /import/jobs/:job_id/errors - Download bad rows error CSV (Section 4.1)
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
            `attachment; filename="${bullJob.data?.table || "table"}_import_errors_${bullJob.id}.csv"`
        );

        const readStream = fs.createReadStream(errorCsvPath);
        readStream.pipe(res);
    } catch (err) {
        console.error("Error downloading error CSV:", err);
        return res.status(500).json({ error: "Failed to download error CSV" });
    }
});

export default router;
