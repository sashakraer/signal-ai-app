import { describe, it, expect } from "vitest";
import {
  mapAccount,
  mapContact,
  mapOpportunity,
  mapCase,
  inferSegment,
  inferTier,
  inferInfluence,
  inferPower,
  type SfAccount,
  type SfContact,
  type SfOpportunity,
  type SfCase,
} from "../../src/adapters/salesforce/mapper.js";

// ─── Test Fixtures ───────────────────────────────────────────────────────────

const baseSfAccount: SfAccount = {
  Id: "001ABC",
  Name: "Atlas Defense Systems",
  Type: "Customer",
  Industry: "Defense",
  AnnualRevenue: 250000,
  NumberOfEmployees: 350,
  OwnerId: "005XYZ",
  Website: "https://atlas-defense.com",
  BillingCountry: "Israel",
  LastModifiedDate: "2026-03-15T10:00:00Z",
};

const baseSfContact: SfContact = {
  Id: "003ABC",
  AccountId: "001ABC",
  FirstName: "Yael",
  LastName: "Cohen",
  Email: "yael@atlas-defense.com",
  Phone: "+972501234567",
  Title: "VP of Engineering",
  Department: "Engineering",
  LastModifiedDate: "2026-03-15T10:00:00Z",
};

const baseSfOpportunity: SfOpportunity = {
  Id: "006ABC",
  AccountId: "001ABC",
  Name: "Atlas - Enterprise Renewal 2026",
  Amount: 300000,
  StageName: "Negotiation",
  CloseDate: "2026-06-30",
  Type: "Renewal",
  OwnerId: "005XYZ",
  Probability: 75,
  LastModifiedDate: "2026-03-15T10:00:00Z",
};

const baseSfCase: SfCase = {
  Id: "500ABC",
  AccountId: "001ABC",
  ContactId: "003ABC",
  Subject: "Integration failing on API v3",
  Priority: "High",
  Status: "Open",
  Type: "Technical Issue",
  CreatedDate: "2026-03-10T08:00:00Z",
  ClosedDate: null,
  LastModifiedDate: "2026-03-15T10:00:00Z",
  OwnerId: "005XYZ",
};

// ─── mapAccount ──────────────────────────────────────────────────────────────

describe("mapAccount", () => {
  it("maps basic account fields correctly", () => {
    const result = mapAccount(baseSfAccount);
    expect(result.sfAccountId).toBe("001ABC");
    expect(result.name).toBe("Atlas Defense Systems");
    expect(result.arr).toBe("250000");
    expect(result.products).toEqual([]);
  });

  it("infers segment as enterprise for 250K ARR", () => {
    const result = mapAccount(baseSfAccount);
    expect(result.segment).toBe("enterprise");
  });

  it("infers tier as high for ARR > 200K", () => {
    const result = mapAccount(baseSfAccount);
    expect(result.tier).toBe("high");
  });

  it("handles null ARR", () => {
    const result = mapAccount({ ...baseSfAccount, AnnualRevenue: null });
    expect(result.arr).toBeNull();
    expect(result.tier).toBe("medium"); // default when unknown
  });

  it("handles null Industry and employees", () => {
    const result = mapAccount({
      ...baseSfAccount,
      AnnualRevenue: null,
      NumberOfEmployees: null,
    });
    expect(result.segment).toBeNull();
  });
});

// ─── mapContact ──────────────────────────────────────────────────────────────

describe("mapContact", () => {
  it("maps basic contact fields correctly", () => {
    const result = mapContact(baseSfContact);
    expect(result.sfContactId).toBe("003ABC");
    expect(result.sfAccountId).toBe("001ABC");
    expect(result.name).toBe("Yael Cohen");
    expect(result.email).toBe("yael@atlas-defense.com");
    expect(result.phone).toBe("+972501234567");
    expect(result.title).toBe("VP of Engineering");
  });

  it("infers VP as decision_maker", () => {
    const result = mapContact(baseSfContact);
    expect(result.influence).toBe("decision_maker");
    expect(result.power).toBe("high");
  });

  it("infers Director as champion", () => {
    const result = mapContact({ ...baseSfContact, Title: "Director of Sales" });
    expect(result.influence).toBe("champion");
    expect(result.power).toBe("high");
  });

  it("infers Manager as advocate", () => {
    const result = mapContact({ ...baseSfContact, Title: "Project Manager" });
    expect(result.influence).toBe("advocate");
    expect(result.power).toBe("low");
  });

  it("infers regular title as professional", () => {
    const result = mapContact({ ...baseSfContact, Title: "Software Engineer" });
    expect(result.influence).toBe("professional");
    expect(result.power).toBe("low");
  });

  it("handles null title", () => {
    const result = mapContact({ ...baseSfContact, Title: null });
    expect(result.influence).toBeNull();
    expect(result.power).toBeNull();
  });

  it("combines first and last name", () => {
    const result = mapContact({ ...baseSfContact, FirstName: null });
    expect(result.name).toBe("Cohen");
  });

  it("interest is always null (derived from engagement data)", () => {
    const result = mapContact(baseSfContact);
    expect(result.interest).toBeNull();
  });
});

// ─── mapOpportunity ──────────────────────────────────────────────────────────

describe("mapOpportunity", () => {
  it("maps basic opportunity fields correctly", () => {
    const result = mapOpportunity(baseSfOpportunity);
    expect(result.sfOpportunityId).toBe("006ABC");
    expect(result.sfAccountId).toBe("001ABC");
    expect(result.name).toBe("Atlas - Enterprise Renewal 2026");
    expect(result.amount).toBe("300000");
    expect(result.stage).toBe("Negotiation");
    expect(result.closeDate).toBe("2026-06-30");
    expect(result.probability).toBe(75);
    expect(result.sfOwnerId).toBe("005XYZ");
  });

  it("normalizes Renewal type", () => {
    const result = mapOpportunity(baseSfOpportunity);
    expect(result.type).toBe("renewal");
  });

  it("normalizes New Business type", () => {
    const result = mapOpportunity({ ...baseSfOpportunity, Type: "New Business" });
    expect(result.type).toBe("new");
  });

  it("normalizes Existing Business type", () => {
    const result = mapOpportunity({ ...baseSfOpportunity, Type: "Existing Business" });
    expect(result.type).toBe("upsell");
  });

  it("lowercases unknown types", () => {
    const result = mapOpportunity({ ...baseSfOpportunity, Type: "Custom Type" });
    expect(result.type).toBe("custom type");
  });

  it("handles null amount", () => {
    const result = mapOpportunity({ ...baseSfOpportunity, Amount: null });
    expect(result.amount).toBeNull();
  });

  it("handles null type", () => {
    const result = mapOpportunity({ ...baseSfOpportunity, Type: null });
    expect(result.type).toBeNull();
  });
});

// ─── mapCase ─────────────────────────────────────────────────────────────────

describe("mapCase", () => {
  it("maps basic case fields correctly", () => {
    const result = mapCase(baseSfCase);
    expect(result.sfCaseId).toBe("500ABC");
    expect(result.sfAccountId).toBe("001ABC");
    expect(result.sfContactId).toBe("003ABC");
    expect(result.subject).toBe("Integration failing on API v3");
    expect(result.priority).toBe("high");
    expect(result.status).toBe("open");
    expect(result.category).toBe("Technical Issue");
    expect(result.openedAt).toBe("2026-03-10T08:00:00Z");
    expect(result.resolvedAt).toBeNull();
    expect(result.sfOwnerId).toBe("005XYZ");
  });

  it("lowercases priority", () => {
    const result = mapCase({ ...baseSfCase, Priority: "Critical" });
    expect(result.priority).toBe("critical");
  });

  it("lowercases status", () => {
    const result = mapCase({ ...baseSfCase, Status: "Closed" });
    expect(result.status).toBe("closed");
  });

  it("handles closed case with ClosedDate", () => {
    const result = mapCase({
      ...baseSfCase,
      Status: "Closed",
      ClosedDate: "2026-03-14T16:00:00Z",
    });
    expect(result.status).toBe("closed");
    expect(result.resolvedAt).toBe("2026-03-14T16:00:00Z");
  });

  it("handles null contact", () => {
    const result = mapCase({ ...baseSfCase, ContactId: null });
    expect(result.sfContactId).toBeNull();
  });
});

// ─── Inference Helpers ───────────────────────────────────────────────────────

describe("inferSegment", () => {
  it("returns strategic for ARR > 500K", () => {
    expect(inferSegment(600000, 50)).toBe("strategic");
  });

  it("returns strategic for 1000+ employees", () => {
    expect(inferSegment(50000, 1500)).toBe("strategic");
  });

  it("returns enterprise for ARR > 100K", () => {
    expect(inferSegment(150000, 50)).toBe("enterprise");
  });

  it("returns enterprise for 200+ employees", () => {
    expect(inferSegment(10000, 300)).toBe("enterprise");
  });

  it("returns smb for small companies", () => {
    expect(inferSegment(50000, 50)).toBe("smb");
  });

  it("returns null when both values are null", () => {
    expect(inferSegment(null, null)).toBeNull();
  });
});

describe("inferTier", () => {
  it("returns high for ARR > 200K", () => {
    expect(inferTier(300000)).toBe("high");
  });

  it("returns medium for ARR > 50K", () => {
    expect(inferTier(100000)).toBe("medium");
  });

  it("returns low for ARR <= 50K", () => {
    expect(inferTier(30000)).toBe("low");
  });

  it("returns medium for null ARR", () => {
    expect(inferTier(null)).toBe("medium");
  });
});

describe("inferInfluence", () => {
  it("CEO → decision_maker", () => {
    expect(inferInfluence("ceo")).toBe("decision_maker");
  });

  it("CTO → decision_maker", () => {
    expect(inferInfluence("cto")).toBe("decision_maker");
  });

  it("VP of Sales → decision_maker", () => {
    expect(inferInfluence("vp of sales")).toBe("decision_maker");
  });

  it("Vice President → decision_maker", () => {
    expect(inferInfluence("vice president of marketing")).toBe("decision_maker");
  });

  it("Director → champion", () => {
    expect(inferInfluence("director of engineering")).toBe("champion");
  });

  it("Head of → champion", () => {
    expect(inferInfluence("head of product")).toBe("champion");
  });

  it("Manager → advocate", () => {
    expect(inferInfluence("account manager")).toBe("advocate");
  });

  it("Senior Engineer → advocate", () => {
    expect(inferInfluence("senior engineer")).toBe("advocate");
  });

  it("Regular title → professional", () => {
    expect(inferInfluence("software engineer")).toBe("professional");
  });

  it("empty string → null", () => {
    expect(inferInfluence("")).toBeNull();
  });
});

describe("inferPower", () => {
  it("C-level → high", () => {
    expect(inferPower("cto")).toBe("high");
  });

  it("VP → high", () => {
    expect(inferPower("vp of sales")).toBe("high");
  });

  it("Director → high", () => {
    expect(inferPower("director of ops")).toBe("high");
  });

  it("Engineer → low", () => {
    expect(inferPower("software engineer")).toBe("low");
  });

  it("empty string → null", () => {
    expect(inferPower("")).toBeNull();
  });
});
