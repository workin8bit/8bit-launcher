import { NextRequest, NextResponse } from "next/server";
import { bootstrapApplication } from "@/core/application/bootstrap";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId") || "user_demo";

  const { facade } = bootstrapApplication();
  const result = await facade.getDashboard({
    userId,
    permissions: [],
  });

  return NextResponse.json(result);
}