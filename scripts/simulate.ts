/**
 * Simulate script — runs the signal engine against seed data.
 *
 * Usage: pnpm simulate  (or: npx tsx scripts/simulate.ts)
 */

import { db } from "../src/db/index.js";
import { customers } from "../src/db/schema.js";

async function simulate() {
  console.log("Loading customers…");

  const allCustomers = await db.select().from(customers);
  console.log(`Found ${allCustomers.length} customers:\n`);

  for (const c of allCustomers) {
    console.log(
      `  • ${c.name} | ARR $${c.arr} | Health ${c.healthScore} | Tier ${c.tier} | Renewal ${c.renewalDate}`
    );
  }

  console.log(
    "\nSimulation complete — TODO: run event detection and signal generation"
  );
  process.exit(0);
}

simulate().catch((err) => {
  console.error("Simulation failed:", err);
  process.exit(1);
});
