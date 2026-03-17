/**
 * Onboarding script — guided setup for a new tenant (design partner).
 *
 * Steps:
 * 1. Create tenant record with basic config
 * 2. Register employees (CSMs, AEs, managers, support)
 * 3. Set tier thresholds (or use defaults)
 * 4. Configure Salesforce credentials (optional)
 * 5. Configure Microsoft Graph credentials (optional)
 * 6. Run initial sync (if credentials provided)
 *
 * Usage: npx tsx scripts/onboard.ts
 */

import { db } from "../src/db/index.js";
import { tenants, employees } from "../src/db/schema.js";
import { eq } from "drizzle-orm";
import * as readline from "node:readline";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function onboard() {
  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("  Signal AI — New Tenant Onboarding");
  console.log("══════════════════════════════════════════════════════════════\n");

  // Step 1: Company info
  console.log("── Step 1: Company Information ──────────────────────────────\n");
  const companyName = await ask("  Company name: ");
  if (!companyName.trim()) {
    console.error("  Company name is required.");
    process.exit(1);
  }

  const timezone = (await ask("  Timezone [Asia/Jerusalem]: ")).trim() || "Asia/Jerusalem";
  const language = (await ask("  Language [he]: ")).trim() || "he";
  const internalDomains = (await ask("  Internal email domains (comma-separated): ")).trim();

  const config = {
    timezone,
    language,
    internalDomains: internalDomains.split(",").map((d) => d.trim()).filter(Boolean),
    thresholds: "default",
  };

  const [tenant] = await db
    .insert(tenants)
    .values({ name: companyName, config })
    .returning();

  console.log(`\n  Created tenant: ${tenant.name} (${tenant.id})\n`);

  // Step 2: Employees
  console.log("── Step 2: Register Employees ───────────────────────────────\n");
  console.log("  Roles: csm, ae, manager, support, renewals, vp");
  console.log("  Enter employees one per line. Empty line to finish.\n");

  const employeeList: Array<{ name: string; email: string; role: string }> = [];

  while (true) {
    const name = (await ask("  Employee name (or empty to finish): ")).trim();
    if (!name) break;

    const email = (await ask("  Email: ")).trim();
    const role = (await ask("  Role [csm]: ")).trim() || "csm";

    employeeList.push({ name, email, role });
  }

  if (employeeList.length > 0) {
    await db.insert(employees).values(
      employeeList.map((e) => ({
        tenantId: tenant.id,
        name: e.name,
        email: e.email,
        role: e.role,
        isMonitored: ["csm", "ae"].includes(e.role),
      }))
    );
    console.log(`\n  Registered ${employeeList.length} employees.`);
  }

  // Step 3: Salesforce config
  console.log("\n── Step 3: Salesforce Configuration (optional) ─────────────\n");
  const sfSetup = (await ask("  Configure Salesforce? [y/N]: ")).trim().toLowerCase();

  if (sfSetup === "y") {
    const sfClientId = await ask("  SF Connected App Client ID: ");
    const sfUsername = await ask("  SF Username (for JWT): ");
    const sfInstanceUrl = await ask("  SF Instance URL (e.g., https://mycompany.my.salesforce.com): ");

    console.log("  SF Private Key: paste the PEM key path or set SF_PRIVATE_KEY env var later.");

    await db
      .update(tenants)
      .set({
        sfCredentials: {
          clientId: sfClientId.trim(),
          username: sfUsername.trim(),
          instanceUrl: sfInstanceUrl.trim(),
        },
      })
      .where(eq(tenants.id, tenant.id));

    console.log("  Salesforce credentials saved.");
  }

  // Step 4: Microsoft Graph config
  console.log("\n── Step 4: Microsoft Graph Configuration (optional) ────────\n");
  const msSetup = (await ask("  Configure Microsoft Graph? [y/N]: ")).trim().toLowerCase();

  if (msSetup === "y") {
    const msTenantId = await ask("  Azure AD Tenant ID: ");
    const msClientId = await ask("  App Registration Client ID: ");
    const msClientSecret = await ask("  Client Secret: ");

    await db
      .update(tenants)
      .set({
        msCredentials: {
          tenantId: msTenantId.trim(),
          clientId: msClientId.trim(),
          clientSecret: msClientSecret.trim(),
        },
      })
      .where(eq(tenants.id, tenant.id));

    console.log("  Microsoft Graph credentials saved.");
  }

  // Summary
  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("  Onboarding Complete!");
  console.log("══════════════════════════════════════════════════════════════");
  console.log(`\n  Tenant ID:  ${tenant.id}`);
  console.log(`  Company:    ${tenant.name}`);
  console.log(`  Employees:  ${employeeList.length}`);
  console.log(`  SF Config:  ${sfSetup === "y" ? "Configured" : "Skipped"}`);
  console.log(`  MS Config:  ${msSetup === "y" ? "Configured" : "Skipped"}`);
  console.log(`\n  Next steps:`);
  console.log(`  1. Set DATABASE_URL and other env vars in .env`);
  console.log(`  2. Run 'npm run db:migrate' to create tables`);
  console.log(`  3. Run 'npm run worker' to start background jobs`);
  console.log(`  4. Run 'npm run dev' to start the API server\n`);

  rl.close();
  process.exit(0);
}

onboard().catch((err) => {
  console.error("Onboarding failed:", err);
  rl.close();
  process.exit(1);
});
