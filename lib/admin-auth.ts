import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getAdminSessionPayload, AdminRole } from "@/lib/admin-session";

export async function getAdminActor(request?: Request | NextRequest): Promise<{
  isValid: boolean;
  role: AdminRole;
  email: string;
} | null> {
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

  const payload = await getAdminSessionPayload(session);
  if (!payload) return null;

  return {
    isValid: true,
    role: payload.adminRole || "superadmin",
    email: payload.email || "admin@goodlife.com",
  };
}

export async function requireAdmin(
  request?: Request | NextRequest,
  allowedRoles?: AdminRole[]
): Promise<NextResponse | null> {
  const actor = await getAdminActor(request);

  if (!actor || !actor.isValid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Superadmin always has access to everything
  if (actor.role === "superadmin") {
    return null;
  }

  // If specific roles are specified, check if actor's role is allowed
  if (allowedRoles && allowedRoles.length > 0) {
    if (!allowedRoles.includes(actor.role)) {
      return NextResponse.json(
        { error: `Forbidden: role '${actor.role}' cannot access this resource` },
        { status: 403 }
      );
    }
  }

  return null;
}
