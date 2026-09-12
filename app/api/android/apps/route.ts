import { bootstrapApplication } from "@/core/application/bootstrap";

export async function GET() {
  const { facade } = bootstrapApplication();
  const result = await facade.getInstalledApps({
    userId: "user_demo",
    permissions: [],
  });
  return Response.json(result);
}