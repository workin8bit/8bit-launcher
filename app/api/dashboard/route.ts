import { NextRequest, NextResponse } from "next/server";
import { bootstrapApplication } from "@/core/application/bootstrap";

// API routes are served by Vercel at runtime, not needed in the Android static bundle.
// Guard against Next.js static-export prerender (no window in Node) — return 503.
function isPrerender(): boolean {
  return typeof window === "undefined";
}

export async function GET(req: NextRequest) {
  if (isPrerender()) {
    return NextResponse.json({ success: false, error: "Not available in static export" }, { status: 503 });
  }
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId") || "user_demo";

  const { facade } = bootstrapApplication();
  const result = await facade.getDashboard({
    userId,
  });

  return NextResponse.json(result);
}