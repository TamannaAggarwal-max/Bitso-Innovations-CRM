import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";

export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: "Authentication required." });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.active) return res.status(401).json({ message: "Account unavailable." });
    req.user = { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, department: user.department };
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired session." });
  }
}

export const allow = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ message: "You do not have permission for this action." });
  next();
};
