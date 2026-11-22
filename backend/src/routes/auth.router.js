import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { db } from "../prisma/db.ts";

const router = Router();

router.post("/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({
            message: "Fill email and password both"
        });
    }

    try {
        const user = await db.orm.public.AdminUser.where({ email }).first();
        if (!user) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        let isPasswordValid = false;
        try {
            isPasswordValid = await bcrypt.compare(password, user.password);
        } catch {
            isPasswordValid = false;
        }

        if (!isPasswordValid && password === user.password) {
            isPasswordValid = true;
        }

        if (!isPasswordValid) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET || "default_jwt_secret_key",
            { expiresIn: "1d" }
        );

        return res.status(200).json({
            message: "Login successful",
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error("Login error:", error);
        return res.status(500).json({
            message: "Internal server error"
        });
    }
});




router.post("/signup", async (req, res) => {
    const { email, password, name, role } = req.body;
    if (!email || !password || !name) {
        return res.status(400).json({
            message: "Name, email, and password are required"
        });
    }

    try {
        const existingUser = await db.orm.public.AdminUser.where({ email }).first();
        if (existingUser) {
            return res.status(409).json({
                message: "User with this email already exists"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const assignedRole = role === "viewer" ? "viewer" : "admin";

        const newUser = await db.orm.public.AdminUser.create({
            email,
            name,
            password: hashedPassword,
            role: assignedRole
        });

        const token = jwt.sign(
            { id: newUser.id, email: newUser.email, role: newUser.role },
            process.env.JWT_SECRET || "default_jwt_secret_key",
            { expiresIn: "1d" }
        );

        return res.status(201).json({
            message: "Admin user registered successfully",
            token,
            user: {
                id: newUser.id,
                name: newUser.name,
                email: newUser.email,
                role: newUser.role
            }
        });
    } catch (error) {
        console.error("Signup error:", error);
        return res.status(500).json({
            message: "Internal server error"
        });
    }
});

export default router;
