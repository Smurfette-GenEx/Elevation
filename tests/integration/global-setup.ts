import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

export const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgresql://expense:expense@localhost:5432/expense_test?schema=public";

/** Resets the test database schema and applies all migrations once per run. */
export default async function setup() {
  const prisma = new PrismaClient({ datasources: { db: { url: TEST_DB } } });
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS public CASCADE`);
  await prisma.$executeRawUnsafe(`CREATE SCHEMA public`);
  await prisma.$disconnect();
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: TEST_DB, CHECKPOINT_DISABLE: "1" }, stdio: "pipe" });
}
