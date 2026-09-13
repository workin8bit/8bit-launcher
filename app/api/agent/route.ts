import { NextRequest, NextResponse } from "next/server";
import { bootstrapApplication } from "@/core/application/bootstrap";

export async function POST(req: NextRequest) {
  try {
    const { goal, userId } = await req.json();
    if (!goal?.trim()) {
      return NextResponse.json(
        { success: false, error: "Goal is required" },
        { status: 400 }
      );
    }

    const { facade } = bootstrapApplication();
    const result = await facade.executeTask(goal, {
      userId: userId || "user_demo",
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}