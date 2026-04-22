import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/types";
import { resolveRoleWithServerFallback } from "@/lib/auth/server-role";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

async function requireAdmin() {
  const requester = await createSupabaseServerClient();
  const {
    data: { user },
  } = await requester.auth.getUser();
  if (!user) return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await requester
    .from("profiles")
    .select("id,role")
    .eq("id", user.id)
    .maybeSingle();
  const role = await resolveRoleWithServerFallback(user, profile?.role);
  if (role !== "admin") {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true as const, userId: user.id };
}

function parsePositiveInteger(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

async function fetchLastSignInByUserId(
  userIds: string[],
) {
  const admin = createSupabaseAdminClient();
  const results = await Promise.allSettled(
    userIds.map(async (userId) => {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error || !data.user) {
        return [userId, null] as const;
      }
      return [userId, data.user.last_sign_in_at ?? null] as const;
    }),
  );

  const lastSignInByUserId = new Map<string, string | null>();
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    const [userId, lastSignInAt] = result.value;
    lastSignInByUserId.set(userId, lastSignInAt);
  }
  return lastSignInByUserId;
}

export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const roleFilter = url.searchParams.get("role");
  const schoolFilterParam = url.searchParams.get("schoolId");
  const schoolFilter = schoolFilterParam && schoolFilterParam !== "all" ? schoolFilterParam : null;
  const page = parsePositiveInteger(url.searchParams.get("page"), 1);
  const requestedPageSize = parsePositiveInteger(
    url.searchParams.get("pageSize"),
    DEFAULT_PAGE_SIZE,
  );
  const pageSize = Math.min(requestedPageSize, MAX_PAGE_SIZE);

  const admin = createSupabaseAdminClient();
  let userIdsForSchoolFilter: string[] | null = null;

  // TODO: Consolidate school filtering + school-name aggregation into a DB view/RPC
  // when data volume grows significantly. Current pagination keeps the hot .in(...)
  // enrichment bounded, but SQL-side aggregation will scale better long term.
  if (schoolFilter) {
    const { data: schoolExists, error: schoolExistsError } = await admin
      .from("schools")
      .select("id")
      .eq("id", schoolFilter)
      .maybeSingle();

    if (schoolExistsError) {
      return NextResponse.json({ error: schoolExistsError.message }, { status: 400 });
    }

    // Keep API behavior predictable: ignore unknown school IDs just like invalid role filters.
    if (schoolExists) {
      const [
        { data: teacherLinks, error: teacherLinkError },
        { data: studentLinks, error: studentLinkError },
      ] = await Promise.all([
        admin.from("school_teachers").select("teacher_user_id").eq("school_id", schoolFilter),
        admin.from("school_members").select("student_user_id").eq("school_id", schoolFilter),
      ]);

      if (teacherLinkError) {
        return NextResponse.json({ error: teacherLinkError.message }, { status: 400 });
      }
      if (studentLinkError) {
        return NextResponse.json({ error: studentLinkError.message }, { status: 400 });
      }

      userIdsForSchoolFilter = Array.from(
        new Set(
          (teacherLinks ?? [])
            .map((link) => link.teacher_user_id)
            .concat((studentLinks ?? []).map((link) => link.student_user_id)),
        ),
      );
    }
  }

  if (userIdsForSchoolFilter && userIdsForSchoolFilter.length === 0) {
    return NextResponse.json({
      users: [],
      pagination: {
        page,
        pageSize,
        total: 0,
        totalPages: 1,
      },
    });
  }

  let query = admin
    .from("profiles")
    .select("id,email,student_id,display_name,role,created_at", { count: "exact" })
    .order("created_at", { ascending: false });

  if (roleFilter && ["student", "teacher", "admin"].includes(roleFilter)) {
    query = query.eq("role", roleFilter as AppRole);
  }
  if (userIdsForSchoolFilter) {
    query = query.in("id", userIdsForSchoolFilter);
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await query.range(from, to);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const users = data ?? [];
  const totalUsers = count ?? users.length;
  const totalPages = Math.max(1, Math.ceil(totalUsers / pageSize));
  const pagination = {
    page,
    pageSize,
    total: totalUsers,
    totalPages,
  };

  const userIds = users.map((user) => user.id);
  if (userIds.length === 0) {
    return NextResponse.json({ users, pagination });
  }

  const [
    { data: teacherLinks, error: teacherLinkError },
    { data: studentLinks, error: studentLinkError },
    lastSignInByUserId,
  ] = await Promise.all([
    admin.from("school_teachers").select("teacher_user_id,school_id").in("teacher_user_id", userIds),
    admin.from("school_members").select("student_user_id,school_id").in("student_user_id", userIds),
    fetchLastSignInByUserId(userIds),
  ]);

  if (teacherLinkError) {
    return NextResponse.json({ error: teacherLinkError.message }, { status: 400 });
  }
  if (studentLinkError) {
    return NextResponse.json({ error: studentLinkError.message }, { status: 400 });
  }

  const schoolIds = Array.from(
    new Set(
      (teacherLinks ?? [])
        .map((link) => link.school_id)
        .concat((studentLinks ?? []).map((link) => link.school_id)),
    ),
  );
  const { data: schoolRows, error: schoolError } =
    schoolIds.length > 0
      ? await admin.from("schools").select("id,name").in("id", schoolIds)
      : { data: [] as Array<{ id: string; name: string }>, error: null };

  if (schoolError) {
    return NextResponse.json({ error: schoolError.message }, { status: 400 });
  }

  const schoolNameById = new Map((schoolRows ?? []).map((school) => [school.id, school.name]));
  const schoolNamesByUser = new Map<string, Set<string>>();

  for (const link of teacherLinks ?? []) {
    const schoolName = schoolNameById.get(link.school_id);
    if (!schoolName) continue;
    const existing = schoolNamesByUser.get(link.teacher_user_id) ?? new Set<string>();
    existing.add(schoolName);
    schoolNamesByUser.set(link.teacher_user_id, existing);
  }

  for (const link of studentLinks ?? []) {
    const schoolName = schoolNameById.get(link.school_id);
    if (!schoolName) continue;
    const existing = schoolNamesByUser.get(link.student_user_id) ?? new Set<string>();
    existing.add(schoolName);
    schoolNamesByUser.set(link.student_user_id, existing);
  }

  const usersWithSchools = users.map((user) => ({
    ...user,
    last_sign_in_at: lastSignInByUserId.get(user.id) ?? null,
    school_names: Array.from(schoolNamesByUser.get(user.id) ?? []).sort((a, b) => a.localeCompare(b)),
  }));

  return NextResponse.json({ users: usersWithSchools, pagination });
}

export async function PATCH(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = (await request.json()) as {
    id?: string;
    role?: AppRole;
    displayName?: string | null;
    studentId?: string | null;
  };

  if (!body.id) {
    return NextResponse.json({ error: "Missing user id" }, { status: 400 });
  }
  if (body.role && !["student", "teacher", "admin"].includes(body.role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const updatePayload: {
    role?: AppRole;
    display_name?: string | null;
    student_id?: string | null;
  } = {};
  if (body.role) updatePayload.role = body.role;
  if (body.displayName !== undefined) updatePayload.display_name = body.displayName;
  if (body.studentId !== undefined) updatePayload.student_id = body.studentId;

  const { error } = await admin.from("profiles").update(updatePayload).eq("id", body.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (body.role) {
    const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(body.id);
    if (authUserError || !authUser.user) {
      return NextResponse.json(
        {
          error:
            authUserError?.message ??
            "Profile role updated, but failed to load auth user for metadata sync.",
        },
        { status: 500 },
      );
    }

    const currentMetadata =
      authUser.user.user_metadata &&
      typeof authUser.user.user_metadata === "object" &&
      !Array.isArray(authUser.user.user_metadata)
        ? authUser.user.user_metadata
        : {};

    const nextMetadata = {
      ...currentMetadata,
      role: body.role,
    };

    const { error: authUpdateError } = await admin.auth.admin.updateUserById(body.id, {
      user_metadata: nextMetadata,
    });

    if (authUpdateError) {
      return NextResponse.json(
        {
          error: `Profile role updated, but failed to sync auth metadata: ${authUpdateError.message}`,
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = (await request.json()) as { id?: string };
  if (!body.id) {
    return NextResponse.json({ error: "Missing user id" }, { status: 400 });
  }
  if (body.id === guard.userId) {
    return NextResponse.json({ error: "You cannot delete your own admin account." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.deleteUser(body.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
