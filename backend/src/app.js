import express from "express"
import authRouter from "./routes/auth.router.js";
import importRouter from "./routes/import.router.js";


const app = express();
app.use(express.json());


app.use("/auth", authRouter);
app.use("/import",importRouter);



app.listen(3000, () => {
    console.log("Server is running on port 3000 ")
})