import express from "express";
import cors from "cors";
import authRouter from "./routes/auth.router.js";
import importRouter from "./routes/import.router.js";
import ordersRouter from "./routes/orders.router.js";
import customersRouter from "./routes/customers.router.js";
import reportsRouter from "./routes/reports.router.js";
import exportRouter from "./routes/export.router.js";
import auditRouter from "./routes/audit.router.js";
import usersRouter from "./routes/users.router.js";


const app = express();

app.use(
    cors({
        origin: "http://localhost:5173",
        credentials: true,
    })
);
app.use(express.json());


app.use("/auth", authRouter);
app.use("/import", importRouter);
app.use("/orders", ordersRouter);
app.use("/customers", customersRouter);
app.use("/reports", reportsRouter);
app.use("/export", exportRouter);
app.use("/audit-logs", auditRouter);
app.use("/users", usersRouter);



app.listen(3000, () => {
    console.log("Server is running on port 3000 ")
})