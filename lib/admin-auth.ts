import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function requireAdmin() {
  const cookieStore = await cookies();
  const session = cookieStore.get("goodlife_admin_session")?.value;
  if (session !== "true") {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }
  return null;
}
