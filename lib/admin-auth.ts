import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { verifyAdminSession } from "@/lib/admin-session";

export async function requireAdmin(request?: Request | NextRequest) {
  let session: string | undefined;
  if (request && "cookies" in request && typeof (request as any).cookies?.get === "function") {
    session = (request as NextRequest).cookies.get("goodlife_admin_session")?.value;
  }
  if (!session) {
    try {
      const cookieStore = await cookies();
      session = cookieStore.get("goodlife_admin_session")?.value;
    } catch {
      // In case cookies() cannot be called outside request context
    }
  }
  const isValid = await verifyAdminSession(session);
  if (!isValid) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }
  return null;
}
