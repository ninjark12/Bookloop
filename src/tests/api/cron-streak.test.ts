import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/db";

// Mock QStash signature verification so the handler runs without a real signature
vi.mock("@upstash/qstash/nextjs", () => ({
  verifySignatureAppRouter: (handler: (req: NextRequest) => Promise<Response>) => handler,
}));

vi.mock("@/lib/email", () => ({
  sendStreakReminderEmail: vi.fn().mockResolvedValue(undefined),
}));

import { sendStreakReminderEmail } from "@/lib/email";
import { POST } from "@/app/api/cron/streak-reminder/route";

function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function makeReq() {
  return new NextRequest("http://localhost/api/cron/streak-reminder", { method: "POST" });
}

describe("POST /api/cron/streak-reminder", () => {
  beforeEach(() => {
    vi.mocked(sendStreakReminderEmail).mockClear();
  });

  it("returns 200 with sent count when no at-risk users exist", async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sent).toBe(0);
    expect(data.errors).toBeUndefined();
  });

  it("sends emails to at-risk users and marks them in redis", async () => {
    const { redis } = await import("@/lib/redis");
    const futureGrace = new Date(Date.now() + 3 * 60 * 60 * 1000);

    vi.mocked(db.then).mockImplementationOnce((resolve: (v: unknown) => void) =>
      resolve([
        { id: "user-1", name: "Alice", email: "alice@example.com", streakCount: 7, graceUntil: futureGrace, lastEntryDate: daysAgoStr(2) },
      ])
    );
    vi.mocked(redis.get).mockResolvedValueOnce(null);

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sent).toBe(1);
    expect(vi.mocked(sendStreakReminderEmail)).toHaveBeenCalledOnce();
    expect(vi.mocked(redis.setex)).toHaveBeenCalled();
  });

  it("skips users whose grace period has already expired", async () => {
    const pastGrace = new Date(Date.now() - 60 * 1000);

    vi.mocked(db.then).mockImplementationOnce((resolve: (v: unknown) => void) =>
      resolve([
        { id: "user-1", name: "Alice", email: "alice@example.com", streakCount: 5, graceUntil: pastGrace, lastEntryDate: daysAgoStr(2) },
      ])
    );

    const res = await POST(makeReq());
    const data = await res.json();
    expect(data.sent).toBe(0);
    expect(vi.mocked(sendStreakReminderEmail)).not.toHaveBeenCalled();
  });

  it("skips users already reminded this grace period", async () => {
    const { redis } = await import("@/lib/redis");
    const futureGrace = new Date(Date.now() + 2 * 60 * 60 * 1000);

    vi.mocked(db.then).mockImplementationOnce((resolve: (v: unknown) => void) =>
      resolve([
        { id: "user-1", name: "Alice", email: "alice@example.com", streakCount: 3, graceUntil: futureGrace, lastEntryDate: daysAgoStr(2) },
      ])
    );
    vi.mocked(redis.get).mockResolvedValueOnce("1");

    const res = await POST(makeReq());
    const data = await res.json();
    expect(data.sent).toBe(0);
  });

  it("skips users with no email address", async () => {
    const futureGrace = new Date(Date.now() + 2 * 60 * 60 * 1000);

    vi.mocked(db.then).mockImplementationOnce((resolve: (v: unknown) => void) =>
      resolve([
        { id: "user-1", name: "Alice", email: null, streakCount: 3, graceUntil: futureGrace, lastEntryDate: daysAgoStr(2) },
      ])
    );

    const res = await POST(makeReq());
    const data = await res.json();
    expect(data.sent).toBe(0);
  });
});
