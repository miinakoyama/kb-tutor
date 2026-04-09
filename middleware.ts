import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { resolveRole } from "@/lib/auth/role";

const PUBLIC_PATHS = ["/login"];
const TEACHER_PATHS = [
  "/teacher-dashboard",
  "/teacher/classes",
  "/assignments/manage",
  "/content",
  "/content/questions",
  "/content/mass-production",
];
const ADMIN_PATHS = ["/content/accounts", "/content/classes"];

type AppRole = "student" | "teacher" | "admin";

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function needsTeacherRole(pathname: string) {
  return TEACHER_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function needsAdminRole(pathname: string) {
  return ADMIN_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function getPostLoginPath(role: AppRole | null) {
  if (role === "admin") return "/content/accounts";
  if (role === "teacher") return "/teacher-dashboard";
  return "/";
}

export async function middleware(req: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request: req,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            req.cookies.set(name, value),
          );
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

  const pathname = req.nextUrl.pathname;
  const isApiAuthPath = pathname.startsWith("/api/auth");
  const isApiPublic = pathname.startsWith("/api/generate-questions");

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

  if (pathname === "/login") {
    const nextUrl = req.nextUrl.clone();
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    const role = resolveRole(profile?.role, user);
    nextUrl.pathname = getPostLoginPath(role);
    return NextResponse.redirect(nextUrl);
  }

  if (needsTeacherRole(pathname) || needsAdminRole(pathname) || pathname.startsWith("/api/admin") || pathname.startsWith("/api/assignments/manage") || pathname.startsWith("/api/teacher")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const role = resolveRole(profile?.role, user);
    if (!role) {
      // Let admin API routes perform definitive checks in route handlers,
      // because profile reads in middleware can fail under RLS/policy setups.
      if (pathname.startsWith("/api/admin")) {
        return supabaseResponse;
      }
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/", req.url));
    }

    if (pathname.startsWith("/api/admin") && role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (pathname.startsWith("/api/assignments/manage") && !["teacher", "admin"].includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (pathname.startsWith("/api/teacher") && !["teacher", "admin"].includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (needsAdminRole(pathname) && role !== "admin") {
      return NextResponse.redirect(new URL("/", req.url));
    }

    if (needsTeacherRole(pathname) && !["teacher", "admin"].includes(role)) {
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

