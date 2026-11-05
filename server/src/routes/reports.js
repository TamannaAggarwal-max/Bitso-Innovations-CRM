import { Router } from "express";
import prisma from "../lib/prisma.js";
import { allow } from "../middleware/auth.js";
const router = Router();
const departments = ["IT_TECH", "SALES_COMMERCIAL", "CUSTOMER_SUPPORT", "OPERATIONS_INFRASTRUCTURE", "FINANCE_ACCOUNTS", "MARKETING_GROWTH", "HR_PEOPLE_OPERATIONS"];

router.get("/summary", allow("ADMIN","TEAM_LEAD","EMPLOYEE"), async (req,res,next) => {
  try {
    const employee = req.user.role === "EMPLOYEE";
    const requestedDepartment = departments.includes(req.query.department) ? req.query.department : null;
    const department = employee ? req.user.department : requestedDepartment;
    const inDepartment = department ? { department } : {};
    const [leads, inboundLeads, clients, employees, projects, tasks, openTasks, sales, followups, tickets, openTickets, openTicketGroups, salesAgg, wonAgg, leadGroups, taskGroups, departmentGroups, customerHealth, customerGroups, leadDepartmentGroups, dealDepartmentGroups, ticketDepartmentGroups] = await Promise.all([
      prisma.lead.count({ where: inDepartment }),
      prisma.lead.count({ where: { ...inDepartment, status: { notIn: ["WON", "LOST"] } } }),
      prisma.client.count({ where: inDepartment }),
      prisma.user.count({ where: { ...inDepartment, active: true } }),
      prisma.project.count({ where: inDepartment }),
      prisma.task.count({ where: inDepartment }),
      prisma.task.count({ where: { ...inDepartment, status: { not: "DONE" } } }),
      prisma.sale.count({ where: inDepartment }),
      prisma.followUp.count({ where: inDepartment }),
      prisma.ticket.count({ where: inDepartment }),
      prisma.ticket.count({ where: { ...inDepartment, status: { notIn: ["RESOLVED", "CLOSED"] } } }),
      prisma.ticket.groupBy({ by: ["status"], where: inDepartment, _count: { _all: true } }),
      prisma.sale.aggregate({ _sum: { amount: true }, where: { ...inDepartment, status: { notIn: ["WON", "LOST"] } } }),
      prisma.sale.aggregate({ _sum: { amount: true }, where: { ...inDepartment, status: "WON" } }),
      prisma.lead.groupBy({ by: ["status"], where: inDepartment, _count: { _all: true } }),
      prisma.task.groupBy({ by: ["status"], where: inDepartment, _count: { _all: true } }),
      prisma.user.groupBy({ by: ["department"], where: { ...inDepartment, active: true }, _count: { _all: true } }),
      prisma.client.count({ where: { ...inDepartment, notes: { contains: "at risk", mode: "insensitive" } } }),
      prisma.client.groupBy({ by: ["department"], where: inDepartment, _count: { _all: true } }),
      prisma.lead.groupBy({ by: ["department"], where: inDepartment, _count: { _all: true } }),
      prisma.sale.groupBy({ by: ["department"], where: { ...inDepartment, status: { notIn: ["WON", "LOST"] } }, _sum: { amount: true } }),
      prisma.ticket.groupBy({ by: ["department"], where: inDepartment, _count: { _all: true } })
    ]);
    const matrixMap = new Map(departments.map(value => [value, { department: value, staff: 0, customers: 0, leads: 0, pipelineValue: 0, tickets: 0 }]));
    for (const row of departmentGroups) if (matrixMap.has(row.department)) matrixMap.get(row.department).staff = row._count._all;
    for (const row of customerGroups) if (matrixMap.has(row.department)) matrixMap.get(row.department).customers = row._count._all;
    for (const row of leadDepartmentGroups) if (matrixMap.has(row.department)) matrixMap.get(row.department).leads = row._count._all;
    for (const row of dealDepartmentGroups) if (matrixMap.has(row.department)) matrixMap.get(row.department).pipelineValue = row._sum.amount || 0;
    for (const row of ticketDepartmentGroups) if (matrixMap.has(row.department)) matrixMap.get(row.department).tickets = row._count._all;
    const departmentMatrix = [...matrixMap.values()].filter(row => !department || row.department === department);
    res.json({ data: {
      leads, inboundLeads, clients, customers: clients, employees, projects, tasks, openTasks,
      sales, followups, tickets, openTickets, wonRevenue: wonAgg._sum.amount || 0,
      pipelineValue: salesAgg._sum.amount || 0, customerHealthAtRisk: customerHealth,
      leadBreakdown: leadGroups, taskBreakdown: taskGroups, ticketBreakdown: openTicketGroups,
      departmentBreakdown: departmentGroups, departmentMatrix, selectedDepartment: department
    } });
  } catch(e) { next(e); }
});
export default router;
