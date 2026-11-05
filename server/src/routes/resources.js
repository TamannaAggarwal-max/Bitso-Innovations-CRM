import { Router } from "express";
import bcrypt from "bcryptjs";
import prisma from "../lib/prisma.js";
import { allow } from "../middleware/auth.js";

const router = Router();
const departments = ["IT_TECH", "SALES_COMMERCIAL", "CUSTOMER_SUPPORT", "OPERATIONS_INFRASTRUCTURE", "FINANCE_ACCOUNTS", "MARKETING_GROWTH", "HR_PEOPLE_OPERATIONS"];
const departmentFilter = (req) => {
  if (req.user.role === "EMPLOYEE") return req.user.department;
  const requested = req.query.department;
  return departments.includes(requested) ? requested : null;
};
const recordActivity = (req, action, entityType, entityId, details, department = req.user.department) => prisma.activity.create({
  data: { action, entityType, entityId, details, department, userId: req.user.id }
});

const configs = {
  leads: { model: "lead", roles: ["ADMIN","TEAM_LEAD","EMPLOYEE"], create: ["name"], searchable: ["name","email","company","phone"], employeeFilter: "ownerId" },
  clients: { model: "client", roles: ["ADMIN","TEAM_LEAD","EMPLOYEE"], create: ["name"], searchable: ["name","email","company","phone"] },
  projects: { model: "project", roles: ["ADMIN","TEAM_LEAD","EMPLOYEE"], create: ["name"], searchable: ["name","description","status"], employeeFilter: "ownerId" },
  tasks: { model: "task", roles: ["ADMIN","TEAM_LEAD","EMPLOYEE"], create: ["title"], searchable: ["title","description","status"], employeeFilter: "assigneeId" },
  sales: { model: "sale", roles: ["ADMIN","TEAM_LEAD","EMPLOYEE"], create: ["title","amount"], searchable: ["title","clientName","status"], employeeFilter: "ownerId" },
  followups: { model: "followUp", roles: ["ADMIN","TEAM_LEAD","EMPLOYEE"], create: ["title","dueAt"], searchable: ["title","details"], employeeFilter: "ownerId" },
  tickets: { model: "ticket", roles: ["ADMIN","TEAM_LEAD","EMPLOYEE"], create: ["title"], searchable: ["title","description","customerName","customerEmail","status"], employeeFilter: "ownerId" },
  contacts: { model: "client", roles: ["ADMIN","TEAM_LEAD","EMPLOYEE"], create: ["name"], searchable: ["name","email","company","phone"] }
};

router.get("/activities", allow("ADMIN","TEAM_LEAD","EMPLOYEE"), async (req,res,next) => {
  try {
    const where = {};
    const selectedDepartment = departmentFilter(req);
    if (selectedDepartment) where.department = selectedDepartment;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    const data = await prisma.activity.findMany({ where, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" }, take: limit });
    res.json({ data });
  } catch(e) { next(e); }
});

for (const [path, cfg] of Object.entries(configs)) {
  const model = prisma[cfg.model];
  router.get(`/${path}`, allow(...cfg.roles), async (req, res, next) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const where = {};
      const selectedDepartment = departmentFilter(req);
      if (selectedDepartment) where.department = selectedDepartment;
      if (req.query.search) where.OR = cfg.searchable.map(field => ({ [field]: { contains: String(req.query.search), mode: "insensitive" } }));
      if (req.user.role === "EMPLOYEE" && cfg.employeeFilter) where[cfg.employeeFilter] = req.user.id;
      const [data,total] = await Promise.all([
        model.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page-1)*limit, take: limit }),
        model.count({ where })
      ]);
      res.json({ data, pagination: { page, limit, total, pages: Math.ceil(total/limit) } });
    } catch(e) { next(e); }
  });

  router.post(`/${path}`, allow(...cfg.roles), async (req,res,next) => {
    try {
      for (const field of cfg.create) if (req.body[field] === undefined || req.body[field] === "") return res.status(400).json({ message: `${field} is required.` });
      const data = { ...req.body };
      if (req.user.role === "EMPLOYEE" || !departments.includes(data.department)) data.department = req.user.department;
      if (cfg.employeeFilter && req.user.role === "EMPLOYEE") data[cfg.employeeFilter] = req.user.id;
      if (cfg.employeeFilter === "ownerId" && !data.ownerId) data.ownerId = req.user.id;
      if (cfg.employeeFilter === "assigneeId" && !data.assigneeId) data.assigneeId = req.user.id;
      delete data.id; delete data.createdAt; delete data.updatedAt;
      const record = await model.create({ data });
      await recordActivity(req, "created", path, record.id, record.name || record.title || record.subject || "New record", record.department);
      res.status(201).json({ data: record });
    } catch(e) { next(e); }
  });

  router.get(`/${path}/:id`, allow(...cfg.roles), async (req,res,next) => {
    try {
      const data = await model.findUnique({ where: { id: req.params.id } });
      if (!data) return res.status(404).json({ message: "Record not found." });
      if (req.user.role === "EMPLOYEE" && cfg.employeeFilter && data[cfg.employeeFilter] !== req.user.id) return res.status(403).json({ message: "Access denied." });
      if (req.user.role === "EMPLOYEE" && data.department !== req.user.department) return res.status(403).json({ message: "Access denied." });
      res.json({ data });
    } catch(e) { next(e); }
  });

  router.patch(`/${path}/:id`, allow(...cfg.roles), async (req,res,next) => {
    try {
      const existing = await model.findUnique({ where: { id: req.params.id } });
      if (!existing) return res.status(404).json({ message: "Record not found." });
      if (req.user.role === "EMPLOYEE" && cfg.employeeFilter && existing[cfg.employeeFilter] !== req.user.id) return res.status(403).json({ message: "Access denied." });
      if (req.user.role === "EMPLOYEE" && existing.department !== req.user.department) return res.status(403).json({ message: "Access denied." });
      const data = { ...req.body }; delete data.id; delete data.createdAt; delete data.updatedAt;
      if (req.user.role === "EMPLOYEE" && cfg.employeeFilter) delete data[cfg.employeeFilter];
      delete data.department;
      const updated = await model.update({ where: { id: req.params.id }, data });
      await recordActivity(req, "updated", path, updated.id, updated.name || updated.title || updated.subject || "Record updated", updated.department);
      res.json({ data: updated });
    } catch(e) { next(e); }
  });

  router.delete(`/${path}/:id`, allow("ADMIN","TEAM_LEAD"), async (req,res,next) => {
    try { await model.delete({ where: { id: req.params.id } }); await recordActivity(req, "deleted", path, req.params.id, "Record deleted"); res.json({ message: "Record deleted." }); }
    catch(e) { next(e); }
  });
}

router.get("/employees", allow("ADMIN","TEAM_LEAD","EMPLOYEE"), async (req,res,next) => {
  try {
    const requestedDepartment = departments.includes(req.query.department) ? req.query.department : null;
    const where = req.user.role === "EMPLOYEE" ? { department: req.user.department, active: true } : requestedDepartment ? { department: requestedDepartment } : {};
    const data = await prisma.user.findMany({ where, select: { id:true,name:true,email:true,phone:true,role:true,department:true,active:true,createdAt:true }, orderBy: { createdAt:"desc" } });
    res.json({ data });
  } catch(e) { next(e); }
});

router.post("/employees", allow("ADMIN"), async (req,res,next) => {
  try {
    const { name,email,password,role,department,phone } = req.body;
    if (!name || !email || !password || !["ADMIN","TEAM_LEAD","EMPLOYEE"].includes(role) || !departments.includes(department)) return res.status(400).json({ message: "Name, email, password, valid role and department are required." });
    if (String(password).length < 10) return res.status(400).json({ message: "Temporary password must be at least 10 characters." });
    const passwordHash = await bcrypt.hash(password,12);
    const data = await prisma.user.create({ data: { name, email: String(email).toLowerCase().trim(), phone: phone || null, passwordHash, role, department }, select: { id:true,name:true,email:true,phone:true,role:true,department:true,active:true,createdAt:true } });
    res.status(201).json({ data });
  } catch(e) { next(e); }
});

router.patch("/employees/:id", allow("ADMIN"), async (req,res,next) => {
  try {
    const { name,email,phone,role,department,active } = req.body;
    if (!name || !email || !["ADMIN","TEAM_LEAD","EMPLOYEE"].includes(role) || !departments.includes(department)) {
      return res.status(400).json({ message: "Name, email, valid role and department are required." });
    }
    const data = await prisma.user.update({
      where: { id: req.params.id },
      data: { name: String(name).trim(), email: String(email).toLowerCase().trim(), phone: phone || null, role, department, ...(typeof active === "boolean" ? { active } : {}) },
      select: { id:true,name:true,email:true,phone:true,role:true,department:true,active:true,createdAt:true }
    });
    res.json({ data });
  } catch(e) { next(e); }
});

export default router;
