import { Router } from "express";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";
import { sendPasswordResetEmail } from "../lib/email.js";
import { authenticate } from "../middleware/auth.js";
const router = Router();
const departments = ["IT_TECH", "SALES_COMMERCIAL", "CUSTOMER_SUPPORT", "OPERATIONS_INFRASTRUCTURE", "FINANCE_ACCOUNTS", "MARKETING_GROWTH", "HR_PEOPLE_OPERATIONS"];

router.post("/request-reset", async (req, res, next) => {
  try {
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: "Enter a valid email address." });
  }

  const genericMessage = "If an active account exists for that email, a password reset link will be sent.";
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, active: true } });
  if (!user || !user.active) return res.json({ message: genericMessage });

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const resetToken = await prisma.$transaction(async tx => {
    await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
    return tx.passwordResetToken.create({ data: { tokenHash, userId: user.id, expiresAt } });
  });

  try {
    await sendPasswordResetEmail({ to: user.email, token: rawToken });
  } catch (error) {
    console.error("Password reset email delivery failed:", error);
    await prisma.passwordResetToken.deleteMany({ where: { id: resetToken.id } });
  }
  return res.json({ message: genericMessage });
  } catch (error) {
    next(error);
  }
});

router.post("/confirm-reset", async (req, res, next) => {
  try {
  const token = typeof req.body.token === "string" ? req.body.token : "";
  const newPassword = typeof req.body.newPassword === "string" ? req.body.newPassword : "";
  if (!/^[a-f0-9]{64}$/.test(token)) return res.status(400).json({ message: "This reset link is invalid or has expired. Request a new one." });
  if (newPassword.length < 10 || Buffer.byteLength(newPassword, "utf8") > 72) {
    return res.status(400).json({ message: "Password must be at least 10 characters and no more than 72 bytes." });
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const now = new Date();
  const passwordHash = await bcrypt.hash(newPassword, 12);
  try {
    await prisma.$transaction(async tx => {
      const reset = await tx.passwordResetToken.findUnique({
        where: { tokenHash },
        select: { id: true, userId: true, expiresAt: true, user: { select: { active: true } } }
      });
      if (!reset || reset.expiresAt <= now || !reset.user.active) throw new Error("INVALID_RESET_TOKEN");

      const consumed = await tx.passwordResetToken.deleteMany({ where: { id: reset.id, expiresAt: { gt: now } } });
      if (consumed.count !== 1) throw new Error("INVALID_RESET_TOKEN");
      await tx.user.update({ where: { id: reset.userId }, data: { passwordHash } });
      await tx.passwordResetToken.deleteMany({ where: { userId: reset.userId } });
    });
  } catch (error) {
    if (error.message === "INVALID_RESET_TOKEN") {
      return res.status(400).json({ message: "This reset link is invalid or has expired. Request a new one." });
    }
    throw error;
  }
  return res.json({ message: "Password updated. You can now sign in with your new password." });
  } catch (error) {
    next(error);
  }
});

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
