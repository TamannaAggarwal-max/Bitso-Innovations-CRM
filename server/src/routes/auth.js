import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
const router = Router();
const departments = ["IT_TECH", "SALES_COMMERCIAL", "CUSTOMER_SUPPORT", "OPERATIONS_INFRASTRUCTURE", "FINANCE_ACCOUNTS", "MARKETING_GROWTH", "HR_PEOPLE_OPERATIONS"];

router.post("/register", async (req, res, next) => {
  try {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const email = typeof req.body.email === "string" ? req.body.email.toLowerCase().trim() : "";
    const phone = typeof req.body.phone === "string" ? req.body.phone.trim() : null;
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const department = req.body.department;

    if (!name || name.length > 100) return res.status(400).json({ message: "Enter your name (up to 100 characters)." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: "Enter a valid email address." });
    if (phone && phone.length > 30) return res.status(400).json({ message: "Phone number must be 30 characters or fewer." });
    if (!departments.includes(department)) return res.status(400).json({ message: "Select a valid department." });
    if (password.length < 10 || Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({ message: "Password must be at least 10 characters and no more than 72 bytes." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, email, phone: phone || null, passwordHash, role: "EMPLOYEE", department },
      select: { id: true, name: true, email: true, phone: true, role: true, department: true }
    });
    const token = jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || "8h" });
    res.status(201).json({ token, user });
  } catch (e) { next(e); }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email and password are required." });
    const user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase().trim() } });
    if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ message: "Incorrect email or password." });
    }
    const token = jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || "8h" });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, department: user.department } });
  } catch (e) { next(e); }
});

router.get("/me", authenticate, async (req, res) => res.json({ user: req.user }));

router.patch("/profile", authenticate, async (req, res, next) => {
  try {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const email = typeof req.body.email === "string" ? req.body.email.toLowerCase().trim() : "";
    const phone = typeof req.body.phone === "string" ? req.body.phone.trim() : null;
    if (!name || name.length > 100) return res.status(400).json({ message: "Enter your name (up to 100 characters)." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: "Enter a valid email address." });
    const department = req.body.department;
    if (phone && phone.length > 30) return res.status(400).json({ message: "Phone number must be 30 characters or fewer." });
    if (!departments.includes(department)) return res.status(400).json({ message: "Select a valid department." });
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { name, email, phone: phone || null, department },
      select: { id: true, name: true, email: true, phone: true, role: true, department: true }
    });
    res.json({ user });
  } catch (e) { next(e); }
});

router.post("/change-password", authenticate, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || String(newPassword).length < 10) return res.status(400).json({ message: "New password must be at least 10 characters." });
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!(await bcrypt.compare(currentPassword || "", user.passwordHash))) return res.status(400).json({ message: "Current password is incorrect." });
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    res.json({ message: "Password updated." });
  } catch (e) { next(e); }
});
export default router;
