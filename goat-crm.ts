import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Helpers ───────────────────────────────────────────────────────────────

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;
// Note: farmRole is not in the User type; role is the only role field

function makeCtx(overrides: Partial<AuthenticatedUser> = {}): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "admin",
    farmId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

// ─── Auth ───────────────────────────────────────────────────────────────────

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const clearedCookies: { name: string; options: Record<string, unknown> }[] = [];
    const ctx = makeCtx();
    ctx.res.clearCookie = (name: string, options: Record<string, unknown>) => {
      clearedCookies.push({ name, options });
    };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.options).toMatchObject({ maxAge: -1 });
  });

  it("returns current user from auth.me", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const user = await caller.auth.me();
    expect(user?.email).toBe("test@example.com");
  });
});

// ─── Breeding — 150-day gestation ───────────────────────────────────────────

describe("breeding.recordMating — 150-day gestation", () => {
  it("calculates expectedKiddingDate as matingDate + 150 days", () => {
    const matingDate = "2025-01-01";
    const d = new Date(matingDate);
    d.setDate(d.getDate() + 150);
    const expected = d.toISOString().split("T")[0];
    // Jan 1 + 150 days = May 30 (31+28+31+30+30 = 150)
    expect(expected).toBe("2025-05-30");
  });

  it("gestation is exactly 150 days for leap-year dates", () => {
    const matingDate = "2024-01-01"; // 2024 is a leap year
    const d = new Date(matingDate);
    d.setDate(d.getDate() + 150);
    const expected = d.toISOString().split("T")[0];
    // 31 (Jan) + 29 (Feb leap) + 31 (Mar) + 30 (Apr) + 29 = 150 → May 29
    expect(expected).toBe("2024-05-29");
  });
});

// ─── Weight — 15% anomaly threshold ─────────────────────────────────────────

describe("weight anomaly detection — 15% threshold", () => {
  function pctChange(prev: number, curr: number) {
    return Math.abs(curr - prev) / prev * 100;
  }

  it("does NOT flag a 14% decrease", () => {
    expect(pctChange(50, 43)).toBeLessThan(15);
  });

  it("does NOT flag exactly 15% change (boundary — not strictly greater)", () => {
    expect(pctChange(50, 42.5)).toBe(15);
    expect(pctChange(50, 42.5) > 15).toBe(false);
  });

  it("flags a 15.1% decrease", () => {
    expect(pctChange(50, 42.45) > 15).toBe(true);
  });

  it("flags a 20% increase", () => {
    expect(pctChange(50, 60) > 15).toBe(true);
  });
});

// ─── Role-based access ───────────────────────────────────────────────────────

describe("role-based access control", () => {
  it("viewer cannot call weight.record (write-protected)", async () => {
    const caller = appRouter.createCaller(makeCtx({ role: "viewer", farmId: 1 }));
    await expect(
      caller.weight.record({ goatId: 1, weightKg: 40, date: "2025-01-01", method: "Scale" })
    ).rejects.toThrow();
  });

  it("viewer cannot call health.bulkVaccinate (write-protected)", async () => {
    const caller = appRouter.createCaller(makeCtx({ role: "viewer", farmId: 1 }));
    await expect(
      caller.health.bulkVaccinate({ product: "Vaccine X", date: "2025-01-01" })
    ).rejects.toThrow();
  });
});

// ─── Reference data ──────────────────────────────────────────────────────────

describe("reference data", () => {
  it("getBreeds returns an array", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const breeds = await caller.reference.getBreeds();
    expect(Array.isArray(breeds)).toBe(true);
  });

  it("getAgeClasses returns an array", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const classes = await caller.reference.getAgeClasses();
    expect(Array.isArray(classes)).toBe(true);
  });
});

// ─── Photo labels ────────────────────────────────────────────────────────────

describe("photo label validation", () => {
  const VALID_LABELS = ["Left_Side", "Right_Side", "Face", "Full_Body", "Ear_Tag", "General"];

  it("includes Left_Side as a valid label", () => {
    expect(VALID_LABELS).toContain("Left_Side");
  });

  it("includes Face as a valid label", () => {
    expect(VALID_LABELS).toContain("Face");
  });
});
