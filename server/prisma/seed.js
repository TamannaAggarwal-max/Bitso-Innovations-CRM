import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const prisma = new PrismaClient();

const users = [
  ["Bitso Admin", "admin@bitsoinnovations.com", "ADMIN"],
  ["Team Lead", "lead@bitsoinnovations.com", "TEAM_LEAD"],
  ["Employee", "employee@bitsoinnovations.com", "EMPLOYEE"]
];

for (const [name, email, role] of users) {
  const passwordHash = await bcrypt.hash("ChangeMe123!", 12);
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { name, email, role, passwordHash }
  });
}
console.log("Demo users ready. Change the demo passwords immediately.");
await prisma.$disconnect();
