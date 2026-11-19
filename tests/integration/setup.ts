process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://expense:expense@localhost:5432/expense_test?schema=public";
process.env.APP_SECRET ??= "integration-test-secret-integration-test-secret";
process.env.EMAIL_DRIVER = "console";
process.env.OCR_PROVIDER = "mock";
process.env.STORAGE_LOCAL_DIR = "./storage/test";
Object.assign(process.env, { NODE_ENV: "test" });
