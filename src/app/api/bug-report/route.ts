import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/get-session";
import { sendBugReportEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let type: "bug" | "feature";
    let title: string;
    let description: string;
    let reporterEmail: string | undefined;
    let reporterName: string | undefined;

    try {
      const body = await req.json();
      type = body.type === "feature" ? "feature" : "bug";
      title = body.title;
      description = body.description;
      reporterEmail = body.reporterEmail;
      reporterName = body.reporterName;
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!title?.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    if (!description?.trim()) {
      return NextResponse.json({ error: "description is required" }, { status: 400 });
    }

    await sendBugReportEmail({
      type,
      title: title.trim(),
      description: description.trim(),
      reporterEmail: reporterEmail ?? session.user.email,
      reporterName: reporterName ?? session.user.name,
    });

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    console.error("[POST /api/bug-report] unhandled error:", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
