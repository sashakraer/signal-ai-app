import { FastifyInstance } from "fastify";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  customers,
  contacts,
  interactions,
  deals,
  tickets,
  signals,
  employees,
} from "../db/schema.js";
import { validateViewToken } from "./view360-token.js";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Customer360 {
  customer: typeof customers.$inferSelect;
  contacts: Array<typeof contacts.$inferSelect>;
  interactions: Array<typeof interactions.$inferSelect>;
  deals: Array<typeof deals.$inferSelect>;
  tickets: Array<typeof tickets.$inferSelect>;
  signals: Array<typeof signals.$inferSelect>;
  csm: { name: string; email: string } | null;
  ae: { name: string; email: string } | null;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

export async function view360Routes(app: FastifyInstance) {
  app.get("/360/:token", async (request, reply) => {
    const { token } = request.params as { token: string };

    const payload = validateViewToken(token);
    if (!payload) {
      return reply.status(403).type("text/html").send(renderError("Link expired or invalid"));
    }

    const data = await load360Data(payload.tenantId, payload.customerId);
    if (!data) {
      return reply.status(404).type("text/html").send(renderError("Customer not found"));
    }

    return reply.type("text/html").send(render360Page(data));
  });
}

// ─── Data Loading ────────────────────────────────────────────────────────────

async function load360Data(
  tenantId: string,
  customerId: string
): Promise<Customer360 | null> {
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)))
    .limit(1);

  if (!customer) return null;

  const [
    contactList,
    interactionList,
    dealList,
    ticketList,
    signalList,
  ] = await Promise.all([
    db
      .select()
      .from(contacts)
      .where(and(eq(contacts.tenantId, tenantId), eq(contacts.customerId, customerId)))
      .orderBy(contacts.name),
    db
      .select()
      .from(interactions)
      .where(and(eq(interactions.tenantId, tenantId), eq(interactions.customerId, customerId)))
      .orderBy(desc(interactions.occurredAt))
      .limit(20),
    db
      .select()
      .from(deals)
      .where(and(eq(deals.tenantId, tenantId), eq(deals.customerId, customerId)))
      .orderBy(desc(deals.updatedAt)),
    db
      .select()
      .from(tickets)
      .where(and(eq(tickets.tenantId, tenantId), eq(tickets.customerId, customerId)))
      .orderBy(desc(tickets.openedAt)),
    db
      .select()
      .from(signals)
      .where(and(eq(signals.tenantId, tenantId), eq(signals.customerId, customerId)))
      .orderBy(desc(signals.createdAt))
      .limit(20),
  ]);

  // Load CSM and AE
  let csm: Customer360["csm"] = null;
  let ae: Customer360["ae"] = null;

  if (customer.csmEmployeeId) {
    const [emp] = await db
      .select({ name: employees.name, email: employees.email })
      .from(employees)
      .where(eq(employees.id, customer.csmEmployeeId))
      .limit(1);
    if (emp) csm = emp;
  }

  if (customer.aeEmployeeId) {
    const [emp] = await db
      .select({ name: employees.name, email: employees.email })
      .from(employees)
      .where(eq(employees.id, customer.aeEmployeeId))
      .limit(1);
    if (emp) ae = emp;
  }

  return {
    customer,
    contacts: contactList,
    interactions: interactionList,
    deals: dealList,
    tickets: ticketList,
    signals: signalList,
    csm,
    ae,
  };
}

// ─── HTML Rendering ──────────────────────────────────────────────────────────

function esc(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderError(message: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Signal AI</title>
<style>${BASE_STYLES}</style>
</head><body>
<div class="container"><div class="card" style="text-align:center;padding:48px 24px;">
<h2 style="color:#DC2626;">${esc(message)}</h2>
<p style="color:#6B7280;">Please request a new link from your Signal AI notification.</p>
</div></div></body></html>`;
}

function render360Page(data: Customer360): string {
  const c = data.customer;
  const hs = c.healthScore ?? 50;
  const hsColor = hs >= 70 ? "#059669" : hs >= 40 ? "#D97706" : "#DC2626";
  const openTickets = data.tickets.filter((t) => t.status !== "resolved" && t.status !== "closed");
  const activeDeals = data.deals.filter((d) => d.stage !== "Closed Won" && d.stage !== "Closed Lost");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(c.name)} — Signal AI 360</title>
<style>${BASE_STYLES}</style>
</head>
<body>
<div class="container">

<!-- Header -->
<div class="header">
  <div class="header-left">
    <h1>${esc(c.name)}</h1>
    <div class="meta">
      ${c.segment ? `<span class="badge">${esc(c.segment)}</span>` : ""}
      ${c.tier ? `<span class="badge badge-${esc(c.tier)}">${esc(c.tier)} tier</span>` : ""}
      ${c.arr ? `<span class="badge">$${Number(c.arr).toLocaleString()} ARR</span>` : ""}
    </div>
  </div>
  <div class="health-ring" style="--color:${hsColor};">
    <span class="health-score">${hs}</span>
    <span class="health-label">Health</span>
  </div>
</div>

<!-- Key Info -->
<div class="grid-2">
  <div class="card">
    <h3>Renewal</h3>
    <p class="big">${c.renewalDate ? formatDate(c.renewalDate) : "Not set"}</p>
    ${c.renewalDate ? `<p class="sub">${daysUntil(c.renewalDate)}</p>` : ""}
  </div>
  <div class="card">
    <h3>Team</h3>
    <p>CSM: <strong>${data.csm ? esc(data.csm.name) : "Unassigned"}</strong></p>
    <p>AE: <strong>${data.ae ? esc(data.ae.name) : "Unassigned"}</strong></p>
  </div>
</div>

${c.signalThesis ? `
<div class="card">
  <h3>Signal Thesis</h3>
  <p>${esc(c.signalThesis)}</p>
</div>` : ""}

<!-- Active Signals -->
${data.signals.length > 0 ? `
<div class="card">
  <h3>Recent Signals <span class="count">${data.signals.length}</span></h3>
  <div class="signal-list">
    ${data.signals.map((s) => `
    <div class="signal-item signal-${esc(s.severity)}">
      <div class="signal-header">
        <span class="severity-dot"></span>
        <strong>${esc(s.title)}</strong>
        <span class="signal-time">${timeAgo(s.createdAt)}</span>
      </div>
      <p>${esc(s.body?.slice(0, 200))}${(s.body?.length ?? 0) > 200 ? "..." : ""}</p>
      ${s.recommendation ? `<p class="recommendation">${esc(s.recommendation)}</p>` : ""}
    </div>`).join("")}
  </div>
</div>` : ""}

<!-- Contacts -->
${data.contacts.length > 0 ? `
<div class="card">
  <h3>Contacts <span class="count">${data.contacts.length}</span></h3>
  <table>
    <thead><tr><th>Name</th><th>Title</th><th>Influence</th><th>Email</th></tr></thead>
    <tbody>
    ${data.contacts.map((ct) => `
    <tr>
      <td><strong>${esc(ct.name)}</strong></td>
      <td>${esc(ct.title)}</td>
      <td><span class="badge badge-sm">${esc(ct.influence)}</span></td>
      <td>${esc(ct.email)}</td>
    </tr>`).join("")}
    </tbody>
  </table>
</div>` : ""}

<!-- Active Deals -->
${activeDeals.length > 0 ? `
<div class="card">
  <h3>Active Deals <span class="count">${activeDeals.length}</span></h3>
  <table>
    <thead><tr><th>Deal</th><th>Stage</th><th>Amount</th><th>Close Date</th><th>Probability</th></tr></thead>
    <tbody>
    ${activeDeals.map((d) => `
    <tr>
      <td><strong>${esc(d.name)}</strong></td>
      <td>${esc(d.stage)}</td>
      <td>${d.amount ? "$" + Number(d.amount).toLocaleString() : "-"}</td>
      <td>${d.closeDate ? formatDate(d.closeDate) : "-"}</td>
      <td>${d.probability != null ? d.probability + "%" : "-"}</td>
    </tr>`).join("")}
    </tbody>
  </table>
</div>` : ""}

<!-- Open Tickets -->
${openTickets.length > 0 ? `
<div class="card">
  <h3>Open Tickets <span class="count">${openTickets.length}</span></h3>
  <table>
    <thead><tr><th>Subject</th><th>Priority</th><th>Status</th><th>Age</th></tr></thead>
    <tbody>
    ${openTickets.map((t) => `
    <tr>
      <td>${esc(t.subject)}</td>
      <td><span class="badge badge-${esc(t.priority)}">${esc(t.priority)}</span></td>
      <td>${esc(t.status)}</td>
      <td>${timeAgo(t.openedAt)}</td>
    </tr>`).join("")}
    </tbody>
  </table>
</div>` : ""}

<!-- Interaction Timeline -->
${data.interactions.length > 0 ? `
<div class="card">
  <h3>Recent Interactions <span class="count">${data.interactions.length}</span></h3>
  <div class="timeline">
    ${data.interactions.map((i) => `
    <div class="timeline-item">
      <div class="timeline-dot dot-${esc(i.direction)}"></div>
      <div class="timeline-content">
        <div class="timeline-header">
          <span class="badge badge-sm">${esc(i.type)}</span>
          <span class="badge badge-sm">${esc(i.direction)}</span>
          ${i.sentiment != null ? `<span class="sentiment ${i.sentiment >= 0 ? "positive" : "negative"}">${i.sentiment > 0 ? "+" : ""}${i.sentiment.toFixed(2)}</span>` : ""}
          <span class="timeline-time">${formatDateTime(i.occurredAt)}</span>
        </div>
        <p class="timeline-subject">${esc(i.subject)}</p>
        ${i.summary ? `<p class="timeline-summary">${esc(i.summary)}</p>` : ""}
      </div>
    </div>`).join("")}
  </div>
</div>` : ""}

<div class="footer">
  Signal AI — Generated ${new Date().toISOString().split("T")[0]}
</div>

</div>
</body>
</html>`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function daysUntil(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const days = Math.floor((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `${days} days away`;
}

function timeAgo(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(d);
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const BASE_STYLES = `
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#F9FAFB;color:#111827;line-height:1.5;-webkit-font-smoothing:antialiased;}
.container{max-width:800px;margin:0 auto;padding:16px;}

.header{display:flex;justify-content:space-between;align-items:flex-start;padding:24px 0;border-bottom:2px solid #E5E7EB;margin-bottom:20px;}
.header h1{font-size:24px;font-weight:700;}
.meta{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;}

.health-ring{width:80px;height:80px;border-radius:50%;border:4px solid var(--color);display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0;}
.health-score{font-size:24px;font-weight:700;color:var(--color);}
.health-label{font-size:11px;color:#6B7280;text-transform:uppercase;}

.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;}
@media(max-width:600px){.grid-2{grid-template-columns:1fr;}}

.card{background:#fff;border:1px solid #E5E7EB;border-radius:8px;padding:16px;margin-bottom:12px;}
.card h3{font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#6B7280;margin-bottom:12px;}
.big{font-size:20px;font-weight:600;}
.sub{color:#6B7280;font-size:13px;margin-top:2px;}
.count{background:#E5E7EB;border-radius:10px;padding:1px 8px;font-size:12px;font-weight:500;}

.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:500;background:#F3F4F6;color:#374151;}
.badge-sm{font-size:11px;padding:1px 6px;}
.badge-high{background:#FEF3C7;color:#92400E;}
.badge-medium{background:#DBEAFE;color:#1E40AF;}
.badge-low{background:#F3F4F6;color:#6B7280;}
.badge-critical,.badge-urgent{background:#FEE2E2;color:#991B1B;}

table{width:100%;border-collapse:collapse;font-size:13px;}
th{text-align:left;padding:8px 8px;border-bottom:2px solid #E5E7EB;font-size:12px;text-transform:uppercase;color:#6B7280;letter-spacing:0.03em;}
td{padding:8px 8px;border-bottom:1px solid #F3F4F6;}

.signal-list{display:flex;flex-direction:column;gap:12px;}
.signal-item{padding:12px;border-radius:6px;border-left:3px solid #E5E7EB;}
.signal-critical{border-left-color:#DC2626;background:#FEF2F2;}
.signal-high{border-left-color:#D97706;background:#FFFBEB;}
.signal-medium{border-left-color:#2563EB;background:#EFF6FF;}
.signal-low{border-left-color:#6B7280;background:#F9FAFB;}
.signal-header{display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;}
.severity-dot{width:8px;height:8px;border-radius:50%;background:currentColor;}
.signal-critical .severity-dot{color:#DC2626;}
.signal-high .severity-dot{color:#D97706;}
.signal-medium .severity-dot{color:#2563EB;}
.signal-low .severity-dot{color:#6B7280;}
.signal-time{font-size:12px;color:#9CA3AF;margin-left:auto;}
.signal-item p{font-size:13px;color:#4B5563;margin-top:4px;}
.recommendation{font-style:italic;color:#059669 !important;margin-top:6px !important;}

.timeline{position:relative;padding-left:24px;}
.timeline-item{position:relative;padding-bottom:16px;}
.timeline-item:not(:last-child)::before{content:'';position:absolute;left:-20px;top:8px;bottom:-8px;width:1px;background:#D1D5DB;}
.timeline-dot{position:absolute;left:-24px;top:4px;width:9px;height:9px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px #D1D5DB;}
.dot-inbound{background:#2563EB;}
.dot-outbound{background:#059669;}
.dot-internal{background:#6B7280;}
.timeline-header{display:flex;gap:6px;align-items:center;flex-wrap:wrap;}
.timeline-time{font-size:12px;color:#9CA3AF;margin-left:auto;}
.timeline-subject{font-size:13px;font-weight:500;margin-top:4px;}
.timeline-summary{font-size:12px;color:#6B7280;margin-top:2px;}
.sentiment{font-size:11px;font-weight:600;padding:1px 6px;border-radius:3px;}
.positive{background:#D1FAE5;color:#065F46;}
.negative{background:#FEE2E2;color:#991B1B;}

.footer{text-align:center;padding:24px 0;font-size:12px;color:#9CA3AF;}
`;
