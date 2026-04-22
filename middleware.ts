import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { resolveRole } from "@/lib/auth/role";
import {
  getSupabaseAnonKey,
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
} from "@/lib/supabase/env";

const PUBLIC_PATHS = ["/login", "/login/staff"];
const E2E_ROLE_COOKIE = "kb_e2e_role";
const E2E_AUTH_BYPASS_ENABLED = process.env.E2E_AUTH_BYPASS === "1";
const E2E_COOKIE_BYPASS_ALLOWED = process.env.NODE_ENV !== "production";

type AppRole = "student" | "teacher" | "admin";
type RoleRule = {
  paths: string[];
  allowedRoles: AppRole[];
};

const PAGE_ROLE_RULES: RoleRule[] = [
  {
    // Keep admin-only routes first because "/content" is also guarded below.
    paths: ["/content/accounts", "/content/schools", "/content/data-analysis"],
    allowedRoles: ["admin"],
  },
  {
    paths: [
      "/teacher-dashboard",
      "/assignments/manage",
      "/content",
      "/content/questions",
      "/content/mass-production",
    ],
    allowedRoles: ["teacher", "admin"],
  },
];

const API_ROLE_RULES: RoleRule[] = [
  { paths: ["/api/admin"], allowedRoles: ["admin"] },
  {
    paths: ["/api/assignments/manage", "/api/teacher"],
    allowedRoles: ["teacher", "admin"],
  },
];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function matchesPath(pathname: string, path: string) {
  return pathname === path || pathname.startsWith(`${path}/`);
}

function getAllowedRoles(pathname: string, rules: RoleRule[]): AppRole[] | null {
  for (const rule of rules) {
    if (rule.paths.some((path) => matchesPath(pathname, path))) {
      return rule.allowedRoles;
    }
  }
  return null;
}

function getPostLoginPath(role: AppRole | null) {
  if (role === "admin") return "/content/accounts";
  if (role === "teacher") return "/teacher-dashboard";
  return "/";
}

function parseE2ERole(value: string | undefined): AppRole | null {
  if (value === "student" || value === "teacher" || value === "admin") {
    return value;
  }
  return null;
}

function applySupabaseCookies(target: NextResponse, source: NextResponse) {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie.name, cookie.value, cookie);
  }
  return target;
}

async function hasHiddenSchoolMembership(userId: string): Promise<boolean> {
  try {
    const admin = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: memberRows, error: memberError } = await admin
      .from("school_members")
      .select("school_id")
      .eq("student_user_id", userId);

    if (memberError) return false;

    const schoolIds = Array.from(
      new Set((memberRows ?? []).map((row) => row.school_id)),
    ).filter(
      (schoolId): schoolId is string =>
        typeof schoolId === "string" && schoolId.length > 0,
    );

    if (schoolIds.length === 0) return false;

    const { data: hiddenSchool } = await admin
      .from("schools")
      .select("id")
      .in("id", schoolIds)
      .eq("is_hidden", true)
      .limit(1)
      .maybeSingle();

    return Boolean(hiddenSchool);
  } catch {
    // Fail open: keep availability if this guard check cannot run.
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const e2eRole = parseE2ERole(req.cookies.get(E2E_ROLE_COOKIE)?.value);
  const isApiAuthPath = pathname.startsWith("/api/auth");
  const isApiPublic =
    pathname.startsWith("/api/generate-questions") ||
    pathname.startsWith("/api/public/");
  const requiredPageRoles = getAllowedRoles(pathname, PAGE_ROLE_RULES);
  const requiredApiRoles = getAllowedRoles(pathname, API_ROLE_RULES);
  const requiredRoles = requiredPageRoles ?? requiredApiRoles;

  if (E2E_AUTH_BYPASS_ENABLED || (E2E_COOKIE_BYPASS_ALLOWED && e2eRole)) {
    const role = e2eRole;
    if (!role) {
      if (!E2E_AUTH_BYPASS_ENABLED) {
        // Cookie-based bypass mode only applies when a valid test role is present.
        // Without that role, continue with normal Supabase-backed auth checks.
      } else {
      if (isPublicPath(pathname) || isApiAuthPath || isApiPublic) {
        return NextResponse.next({ request: req });
      }
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
      }
    }

    if (role && requiredApiRoles && !requiredApiRoles.includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (role && requiredPageRoles && !requiredPageRoles.includes(role)) {
      return NextResponse.redirect(new URL("/", req.url));
    }

    if (role) {
      return NextResponse.next({ request: req });
    }
  }

  let supabaseResponse = NextResponse.next({
    request: req,
  });

  const supabase = createServerClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          supabaseResponse = NextResponse.next({
            request: req,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (isPublicPath(pathname) || isApiAuthPath || isApiPublic) {
      return supabaseResponse;
    }
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  let resolvedRole: AppRole | null | undefined;
  const getResolvedRole = async (): Promise<AppRole | null> => {
    if (resolvedRole !== undefined) return resolvedRole;
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    resolvedRole = resolveRole(profile?.role, user);
    if (resolvedRole) return resolvedRole;

    // Fallback: if session-scoped profile read fails, resolve via service-role.
    try {
      const admin = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });

      const { data: adminProfile } = await admin
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      resolvedRole = resolveRole(adminProfile?.role, user);
    } catch {
      // Keep null and let existing route guards handle behavior.
    }

    return resolvedRole;
  };

  const role = await getResolvedRole();
  if (role === "student") {
    const blocked = await hasHiddenSchoolMembership(user.id);
    if (blocked) {
      await supabase.auth.signOut();

      if (isApiAuthPath || isApiPublic) {
        return supabaseResponse;
      }

      if (pathname.startsWith("/api/")) {
        return applySupabaseCookies(
          NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
          supabaseResponse,
        );
      }

      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/login";
      if (!isPublicPath(pathname)) {
        loginUrl.searchParams.set("next", pathname);
      }
      return applySupabaseCookies(NextResponse.redirect(loginUrl), supabaseResponse);
    }
  }

  // Authenticated users visiting a login page → redirect to their dashboard
  if (pathname === "/login" || pathname === "/login/staff") {
    const nextUrl = req.nextUrl.clone();
    nextUrl.pathname = getPostLoginPath(role);
    return NextResponse.redirect(nextUrl);
  }

  if (requiredRoles) {
    const role = await getResolvedRole();
    if (!role) {
      // Let admin API routes perform definitive checks in route handlers,
      // because profile reads in middleware can fail under RLS/policy setups.
      if (requiredApiRoles?.includes("admin") && requiredApiRoles.length === 1) {
        return supabaseResponse;
      }
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/", req.url));
    }

    if (requiredApiRoles && !requiredApiRoles.includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (requiredPageRoles && !requiredPageRoles.includes(role)) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
