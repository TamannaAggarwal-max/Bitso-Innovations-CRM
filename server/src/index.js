import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import authRoutes from "./routes/auth.js";
import resourceRoutes from "./routes/resources.js";
import reportRoutes from "./routes/reports.js";
import prisma from "./lib/prisma.js";
import { authenticate } from "./middleware/auth.js";
import { notFound, errorHandler } from "./middleware/errors.js";

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error("JWT_SECRET must be at least 32 characters.");
const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL?.split(",") || "http://localhost:5173" }));
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));
app.use(["/api/auth/login", "/api/auth/register"], rateLimit({ windowMs: 15*60*1000, limit: 20, standardHeaders: true, legacyHeaders: false }));
app.get("/api/health", async (req,res) => {
	try {
		await prisma.$queryRaw`SELECT 1`;
		res.json({ status:"ok", database:"connected", service:"Bitso Innovations CRM API" });
	} catch {
		res.status(503).json({ status:"error", database:"unavailable", service:"Bitso Innovations CRM API" });
	}
});
app.use("/api/auth", authRoutes);
app.use("/api", authenticate, resourceRoutes);
app.use("/api/reports", authenticate, reportRoutes);
app.use(notFound);
app.use(errorHandler);
const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`Bitso CRM API running on port ${port}`));
