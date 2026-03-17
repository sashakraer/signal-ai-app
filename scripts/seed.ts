/**
 * Seed script — populates the database with demo data for development and testing.
 *
 * Usage: pnpm seed  (or: npx tsx scripts/seed.ts)
 */

import { db } from "../src/db/index.js";
import {
  tenants,
  employees,
  customers,
  contacts,
} from "../src/db/schema.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Return an ISO date string N days from today. */
function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function seed() {
  console.log("Seeding database…");

  // 1. Tenant
  const [tenant] = await db
    .insert(tenants)
    .values({ name: "Demo Company", config: {} })
    .returning();
  const tenantId = tenant.id;
  console.log(`  ✓ Tenant "${tenant.name}" (${tenantId})`);

  // 2. Employees
  const employeeRows = [
    { name: "David Cohen", email: "david@democompany.com", role: "ae", department: "Sales" },
    { name: "Rachel Levi", email: "rachel@democompany.com", role: "csm", department: "Customer Success" },
    { name: "Yossi Katz", email: "yossi@democompany.com", role: "manager", department: "Customer Success" },
    { name: "Amit Sharon", email: "amit@democompany.com", role: "support", department: "Support" },
    { name: "Maya Ben-Ari", email: "maya@democompany.com", role: "renewals", department: "Sales" },
  ] as const;

  const insertedEmployees = await db
    .insert(employees)
    .values(
      employeeRows.map((e) => ({
        tenantId,
        name: e.name,
        email: e.email,
        role: e.role,
        department: e.department,
      }))
    )
    .returning();

  const emp = Object.fromEntries(insertedEmployees.map((e) => [e.role, e]));
  console.log(`  ✓ ${insertedEmployees.length} employees`);

  // 3. Customers
  const customerSpecs = [
    { name: "Atlas Defense Systems", segment: "enterprise", arr: "26000", healthScore: 15, tier: "medium", renewalDays: 22 },
    { name: "Meridian Pharma", segment: "enterprise", arr: "85000", healthScore: 82, tier: "high", renewalDays: 180 },
    { name: "Nova Energy Solutions", segment: "enterprise", arr: "42000", healthScore: 65, tier: "medium", renewalDays: 90 },
    { name: "Pinnacle Retail Group", segment: "smb", arr: "18000", healthScore: 20, tier: "low", renewalDays: 45 },
    { name: "Horizon Logistics", segment: "enterprise", arr: "35000", healthScore: 58, tier: "medium", renewalDays: 120 },
    { name: "Sapphire Insurance", segment: "strategic", arr: "156000", healthScore: 88, tier: "high", renewalDays: 200 },
    { name: "Vertex Automotive", segment: "enterprise", arr: "28000", healthScore: 45, tier: "medium", renewalDays: 60 },
    { name: "Cedar Healthcare", segment: "smb", arr: "22000", healthScore: 80, tier: "low", renewalDays: 300 },
    { name: "Orion Telecom", segment: "enterprise", arr: "67000", healthScore: 85, tier: "high", renewalDays: 150 },
    { name: "Delta Construction", segment: "smb", arr: "8500", healthScore: 42, tier: "low", renewalDays: 240 },
  ];

  const insertedCustomers = await db
    .insert(customers)
    .values(
      customerSpecs.map((c) => ({
        tenantId,
        name: c.name,
        segment: c.segment,
        arr: c.arr,
        healthScore: c.healthScore,
        tier: c.tier,
        renewalDate: daysFromNow(c.renewalDays),
        csmEmployeeId: emp["csm"].id,
        aeEmployeeId: emp["ae"].id,
      }))
    )
    .returning();

  console.log(`  ✓ ${insertedCustomers.length} customers`);

  // 4. Contacts — 2-3 per customer
  const contactsByCustomer: Record<string, { name: string; title: string; email: string; influence: string }[]> = {
    "Atlas Defense Systems": [
      { name: "Alon Baruch", title: "CTO", email: "alon.baruch@atlasdefense.com", influence: "decision_maker" },
      { name: "Noa Stein", title: "VP Engineering", email: "noa.stein@atlasdefense.com", influence: "champion" },
      { name: "Eran Harel", title: "IT Director", email: "eran.harel@atlasdefense.com", influence: "professional" },
    ],
    "Meridian Pharma": [
      { name: "Shira Gold", title: "VP Operations", email: "shira.gold@meridianpharma.com", influence: "decision_maker" },
      { name: "Tomer Azulay", title: "Data Lead", email: "tomer.azulay@meridianpharma.com", influence: "champion" },
      { name: "Liat Navon", title: "Head of Analytics", email: "liat.navon@meridianpharma.com", influence: "advocate" },
    ],
    "Nova Energy Solutions": [
      { name: "Michael Torres", title: "CTO", email: "michael.torres@novaenergy.com", influence: "decision_maker" },
      { name: "Lisa Park", title: "VP Operations", email: "lisa.park@novaenergy.com", influence: "champion" },
    ],
    "Pinnacle Retail Group": [
      { name: "Sari Dagan", title: "CEO", email: "sari.dagan@pinnacleretail.com", influence: "check_signer" },
      { name: "Rami Yosef", title: "Head of IT", email: "rami.yosef@pinnacleretail.com", influence: "professional" },
    ],
    "Horizon Logistics": [
      { name: "Gadi Mor", title: "VP Technology", email: "gadi.mor@horizonlog.com", influence: "decision_maker" },
      { name: "Dana Levy", title: "Product Manager", email: "dana.levy@horizonlog.com", influence: "advocate" },
      { name: "Oren Paz", title: "Head of BI", email: "oren.paz@horizonlog.com", influence: "champion" },
    ],
    "Sapphire Insurance": [
      { name: "Ruth Mendel", title: "CIO", email: "ruth.mendel@sapphireins.com", influence: "decision_maker" },
      { name: "Yair Koren", title: "VP Digital", email: "yair.koren@sapphireins.com", influence: "champion" },
      { name: "Michal Arad", title: "Data Science Lead", email: "michal.arad@sapphireins.com", influence: "advocate" },
    ],
    "Vertex Automotive": [
      { name: "Eli Shapira", title: "CTO", email: "eli.shapira@vertexauto.com", influence: "decision_maker" },
      { name: "Yael Barak", title: "Engineering Manager", email: "yael.barak@vertexauto.com", influence: "professional" },
    ],
    "Cedar Healthcare": [
      { name: "Tamar Rubin", title: "Admin", email: "tamar.rubin@cedarhc.com", influence: "professional" },
      { name: "Doron Segal", title: "CEO", email: "doron.segal@cedarhc.com", influence: "check_signer" },
      { name: "Rina Vardi", title: "Operations Manager", email: "rina.vardi@cedarhc.com", influence: "advocate" },
    ],
    "Orion Telecom": [
      { name: "Avi Peled", title: "VP Engineering", email: "avi.peled@oriontelecom.com", influence: "decision_maker" },
      { name: "Hila Stern", title: "Head of Product", email: "hila.stern@oriontelecom.com", influence: "champion" },
    ],
    "Delta Construction": [
      { name: "Moshe Dayan", title: "IT Manager", email: "moshe.dayan@deltaconst.com", influence: "professional" },
      { name: "Sigal Avni", title: "CFO", email: "sigal.avni@deltaconst.com", influence: "check_signer" },
    ],
  };

  let contactCount = 0;
  for (const cust of insertedCustomers) {
    const specs = contactsByCustomer[cust.name];
    if (!specs) continue;

    await db.insert(contacts).values(
      specs.map((c) => ({
        tenantId,
        customerId: cust.id,
        name: c.name,
        email: c.email,
        title: c.title,
        influence: c.influence,
      }))
    );
    contactCount += specs.length;
  }

  console.log(`  ✓ ${contactCount} contacts`);
  console.log("\nSeed complete.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
