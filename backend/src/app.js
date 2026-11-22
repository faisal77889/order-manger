import express from "express"
import authRouter from "./routes/auth.router.js";
import importRouter from "./routes/import.router.js";
import ordersRouter from "./routes/orders.router.js";
import customersRouter from "./routes/customers.router.js";
import reportsRouter from "./routes/reports.router.js";


const app = express();
app.use(express.json());


app.use("/auth", authRouter);
app.use("/import", importRouter);
app.use("/orders", ordersRouter);
app.use("/customers", customersRouter);
app.use("/reports", reportsRouter);



app.listen(3000, () => {
    console.log("Server is running on port 3000 ")
})