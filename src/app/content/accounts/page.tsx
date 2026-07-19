"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { alertSuccess } from "@/lib/ui/status-badge-styles";

type Role = "student" | "teacher" | "admin";

interface UserRow {
  id: string;
  email: string;
  student_id: string | null;
  display_name: string | null;
  role: Role;
  excluded_from_analytics: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  school_id: string | null;
  school_names?: string[];
}

interface SchoolOption {
  id: string;
  name: string;
}

interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

function normalizeAdminError(message: string | undefined, defaultMessage: string) {
  if (!message) return defaultMessage;
  if (message === "Forbidden") {
    return "Forbidden: Could not verify admin privileges. Check whether profiles.role or metadata.role is set to admin.";
  }
  return message;
}

const GEIST = "var(--font-geist), ui-sans-serif, sans-serif";

/** Card recipe from the design system: glass surface + hairline + shadow. */
const CARD_STYLE: React.CSSProperties = {
  background: "var(--assignment-glass-bg-strong)",
  border: "1px solid var(--assignment-glass-border)",
  boxShadow: "var(--assignment-card-shadow)",
};

const INPUT_STYLE: React.CSSProperties = {
  background: "var(--surface-muted)",
  border: "1px solid var(--border-default)",
};

/** Rounded-xl field, muted fill, primary focus ring. */
const INPUT_CLASS =
  "w-full rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40";

/** Primary pill CTA (design-system hero CTA). */
const PRIMARY_BTN_CLASS =
  "inline-flex items-center justify-center gap-2 rounded-full font-bold transition duration-200 hover:brightness-110 active:brightness-95 disabled:opacity-50 disabled:hover:brightness-100";
const PRIMARY_BTN_STYLE: React.CSSProperties = {
  color: "var(--assignment-cta-text)",
  background: "var(--assignment-cta-bg-strong)",
  border: "1.5px solid var(--assignment-glass-border)",
  boxShadow: "var(--assignment-cta-elevated-shadow)",
  fontFamily: GEIST,
};

/** Lighter-green pill for the per-row Save (softer than the primary CTA). */
const SAVE_BTN_STYLE: React.CSSProperties = {
  color: "#ffffff",
  background: "var(--assignment-progress-fill)",
  border: "1.5px solid var(--assignment-glass-border)",
  boxShadow: "var(--assignment-row-cta-shadow)",
  fontFamily: GEIST,
};

/** Neutral pill CTA (design-system row CTA). */
const SECONDARY_BTN_CLASS =
  "inline-flex items-center justify-center rounded-full font-semibold transition-colors hover:bg-[var(--assignment-row-cta-bg-hover)] disabled:opacity-50";
const SECONDARY_BTN_STYLE: React.CSSProperties = {
  color: "var(--assignment-row-cta-text)",
  background: "var(--assignment-row-cta-bg)",
  border: "1px solid var(--assignment-row-cta-border)",
  boxShadow: "var(--assignment-row-cta-shadow)",
};

export default function AccountManagementPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [savedSchoolIds, setSavedSchoolIds] = useState<
    Record<string, string | null>
  >({});
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [roleFilter, setRoleFilter] = useState<"all" | Role>("all");
  const [analyticsFilter, setAnalyticsFilter] = useState<
    "all" | "included" | "excluded"
  >("all");
  const [schoolFilter, setSchoolFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(25);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: "",
    displayName: "",
    password: "",
    role: "teacher" as "teacher" | "admin",
    schoolId: "",
  });

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (roleFilter !== "all") params.set("role", roleFilter);
    if (analyticsFilter !== "all") params.set("analytics", analyticsFilter);
    if (schoolFilter !== "all") params.set("schoolId", schoolFilter);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    const query = params.toString() ? `?${params.toString()}` : "";
    const response = await fetch(`/api/admin/users${query}`, { cache: "no-store" });
    const payload = (await response.json()) as {
      users?: UserRow[];
      error?: string;
      pagination?: PaginationMeta;
    };
    if (!response.ok) {
      setError(normalizeAdminError(payload.error, "Failed to load users."));
      setLoading(false);
      return;
    }
    const nextUsers = payload.users ?? [];
    setUsers(nextUsers);
    setSavedSchoolIds(
      Object.fromEntries(nextUsers.map((user) => [user.id, user.school_id ?? null])),
    );
    setTotalUsers(payload.pagination?.total ?? payload.users?.length ?? 0);
    setTotalPages(payload.pagination?.totalPages ?? 1);
    setLoading(false);
  }, [analyticsFilter, page, pageSize, roleFilter, schoolFilter]);

  const loadSchools = useCallback(async () => {
    const response = await fetch("/api/admin/schools", { cache: "no-store" });
    const payload = (await response.json()) as {
      schools?: Array<{ id: string; name: string }>;
      error?: string;
    };
    if (!response.ok) {
      setError(normalizeAdminError(payload.error, "Failed to load schools."));
      return;
    }
    setSchools((payload.schools ?? []).map((school) => ({ id: school.id, name: school.name })));
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    void loadSchools();
  }, [loadSchools]);

  useEffect(() => {
    setPage(1);
  }, [analyticsFilter, roleFilter, schoolFilter, pageSize]);

  async function saveUser(user: UserRow) {
    const nextSchoolId = user.role === "teacher" ? user.school_id : null;
    const previousSchoolId = savedSchoolIds[user.id] ?? null;
    if (nextSchoolId !== previousSchoolId) {
      const userLabel = user.display_name || user.email;
      const previousSchoolName =
        schools.find((school) => school.id === previousSchoolId)?.name ??
        "Unassigned";
      const nextSchoolName =
        schools.find((school) => school.id === nextSchoolId)?.name ??
        "Unassigned";
      const prompt = previousSchoolId
        ? nextSchoolId
          ? `Move ${userLabel} from ${previousSchoolName} to ${nextSchoolName}? Access to ${previousSchoolName} will be removed immediately.`
          : `Unassign ${userLabel} from ${previousSchoolName}? Access to that school will be removed immediately.`
        : `Assign ${userLabel} to ${nextSchoolName}?`;
      if (!confirm(prompt)) return;
    }

    setMessage(null);
    setError(null);
    const response = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: user.id,
        role: user.role,
        displayName: user.display_name,
        studentId: user.student_id,
        excludedFromAnalytics: user.role === "student" ? user.excluded_from_analytics : false,
        schoolId: nextSchoolId,
      }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(normalizeAdminError(payload.error, "Failed to update user."));
      return;
    }
    setMessage("User updated.");
    await loadUsers();
  }

  async function deleteUser(userId: string) {
    if (!confirm("Delete this user account? This cannot be undone.")) return;
    setMessage(null);
    setError(null);
    const response = await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: userId }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(normalizeAdminError(payload.error, "Failed to delete user."));
      return;
    }
    setUsers((prev) => prev.filter((user) => user.id !== userId));
    setMessage("User deleted.");
  }

  async function createStaffUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    setIsCreating(true);

    try {
      const response = await fetch("/api/admin/provision-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: createForm.email,
          displayName: createForm.displayName,
          password: createForm.password,
          role: createForm.role,
          schoolId: createForm.role === "teacher" ? createForm.schoolId || null : null,
        }),
      });
      const payload = (await response.json()) as { error?: string; email?: string };
      if (!response.ok) {
        setError(normalizeAdminError(payload.error, "Failed to create user."));
        return;
      }

      setMessage(`Account created: ${payload.email ?? createForm.email}`);
      setShowCreateModal(false);
      setCreateForm({
        email: "",
        displayName: "",
        password: "",
        role: "teacher",
        schoolId: "",
      });
      await loadUsers();
    } finally {
      setIsCreating(false);
    }
  }

  function updateLocalUser(id: string, updates: Partial<UserRow>) {
    setUsers((prev) => prev.map((user) => (user.id === id ? { ...user, ...updates } : user)));
  }

  function formatDate(value: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "—";
    return parsed.toLocaleDateString();
  }

  function formatDateTime(value: string | null) {
    if (!value) return "Never";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "—";
    return parsed.toLocaleString();
  }

  return (
    <main
      className="mx-auto w-full px-4 py-10 sm:px-6 sm:py-12 lg:px-10 lg:py-14 xl:px-12"
      style={{ maxWidth: 1500 }}
    >
      <header className="mb-10 flex items-center justify-between gap-4">
        <h1 className="font-heading text-2xl font-bold text-heading sm:text-3xl">
          Account Management
        </h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className={`${PRIMARY_BTN_CLASS} h-12 flex-shrink-0 gap-2.5 px-6 text-base`}
          style={PRIMARY_BTN_STYLE}
        >
          <Plus className="h-5 w-5" />
          Create Staff Account
        </button>
      </header>

      <section className="mb-8 rounded-2xl p-5 sm:p-6" style={CARD_STYLE}>
  <div className="flex flex-wrap items-end gap-4">
    <label className="text-sm text-slate-gray">
      <span className="mb-1 block font-semibold">Role filter</span>
      <select
        value={roleFilter}
        onChange={(event) => setRoleFilter(event.target.value as "all" | Role)}
        className={INPUT_CLASS}
        style={INPUT_STYLE}
      >
        <option value="all">All roles</option>
        <option value="student">student</option>
        <option value="teacher">teacher</option>
        <option value="admin">admin</option>
      </select>
    </label>

    <label className="text-sm text-slate-gray">
      <span className="mb-1 block font-semibold">Analytics filter</span>
      <select
        value={analyticsFilter}
        onChange={(event) =>
          setAnalyticsFilter(event.target.value as "all" | "included" | "excluded")
        }
        className={INPUT_CLASS}
        style={INPUT_STYLE}
      >
        <option value="all">All users</option>
        <option value="included">Included in analytics</option>
        <option value="excluded">Excluded from analytics</option>
      </select>
    </label>

    <label className="text-sm text-slate-gray">
      <span className="mb-1 block font-semibold">School filter</span>
      <select
        value={schoolFilter}
        onChange={(event) => setSchoolFilter(event.target.value)}
        className={INPUT_CLASS}
        style={INPUT_STYLE}
      >
        <option value="all">All schools</option>
        {schools.map((school) => (
          <option key={school.id} value={school.id}>
            {school.name}
          </option>
        ))}
      </select>
    </label>
  </div>

  <p className="mt-4 text-xs text-muted-foreground">
    Users marked as &quot;Excluded from analytics&quot; are skipped when computing teacher dashboard
    metrics and assignment response counts. This setting applies to student accounts only. Use this
    for developer or test accounts whose data should not affect reporting.
  </p>
  <p className="mt-2 text-xs text-muted-foreground">
    Teacher accounts can be assigned to one school or left unassigned. Admin accounts can access all
    schools.
  </p>
</section>

      {message && (
        <p className={`${alertSuccess} mb-6`}>
          {message}
        </p>
      )}
      {error && (
        <p className="mb-6 rounded-xl border border-error-border bg-error-light px-3.5 py-2.5 text-sm text-error">
          {error}
        </p>
      )}

      <section className="rounded-2xl p-5 sm:p-6" style={CARD_STYLE}>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading users...</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-muted-foreground">No users found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border-default text-left text-muted-foreground">
                  <th className="px-2 py-2 font-medium">Student ID</th>
                  <th className="px-2 py-2 font-medium">Display Name</th>
                  <th className="px-2 py-2 font-medium">Role</th>
                  <th className="px-2 py-2 font-medium">Email</th>
                  <th className="px-2 py-2 font-medium">Schools</th>
                  <th className="px-2 py-2 font-medium">Exclude from analytics</th>
                  <th className="px-2 py-2 font-medium">Dates</th>
                  <th className="px-2 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-border-subtle align-top">
                    <td className="px-2 py-3 min-w-[140px]">
                      <input
                        value={user.student_id ?? ""}
                        onChange={(e) =>
                          updateLocalUser(user.id, { student_id: e.target.value || null })
                        }
                        className="w-full rounded-xl px-2.5 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                        style={INPUT_STYLE}
                      />
                    </td>
                    <td className="px-2 py-3 min-w-[180px]">
                      <input
                        value={user.display_name ?? ""}
                        onChange={(e) =>
                          updateLocalUser(user.id, { display_name: e.target.value || null })
                        }
                        className="w-full rounded-xl px-2.5 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                        style={INPUT_STYLE}
                      />
                    </td>
                    <td className="px-2 py-3 min-w-[130px]">
                      <select
                        value={user.role}
                        onChange={(e) =>
                          updateLocalUser(user.id, { role: e.target.value as Role })
                        }
                        className="w-full rounded-xl px-2.5 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                        style={INPUT_STYLE}
                      >
                        <option value="student">student</option>
                        <option value="teacher">teacher</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td className="px-2 py-3 min-w-[220px] break-all text-slate-gray">
                      {user.email}
                    </td>
                    
                    <td className="px-2 py-3 min-w-[180px] max-w-[220px] whitespace-normal break-words text-slate-gray">
                      {user.role === "teacher" ? (
                        <select
                          aria-label={`School for ${user.display_name || user.email}`}
                          value={user.school_id ?? ""}
                          onChange={(event) =>
                            updateLocalUser(user.id, {
                              school_id: event.target.value || null,
                            })
                          }
                          className="w-full rounded-xl px-2.5 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                          style={INPUT_STYLE}
                        >
                          <option value="">Unassigned</option>
                          {schools.map((school) => (
                            <option key={school.id} value={school.id}>
                              {school.name}
                            </option>
                          ))}
                        </select>
                      ) : user.role === "admin" ? (
                        <span className="text-xs text-muted-foreground">All schools</span>
                      ) : user.school_names && user.school_names.length > 0 ? (
                        user.school_names.join(", ")
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-2 py-3 min-w-[170px]">
                      {user.role === "student" ? (
                        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={user.excluded_from_analytics}
                            onChange={(e) =>
                              updateLocalUser(user.id, {
                                excluded_from_analytics: e.target.checked,
                              })
                            }
                            className="h-4 w-4 rounded focus:ring-2 focus:ring-primary/40"
                            style={{ accentColor: "var(--assignment-completed)" }}
                          />
                          <span className="text-xs text-slate-gray/80">
                            {user.excluded_from_analytics ? "Excluded" : "Included"}
                          </span>
                        </label>
                      ) : (
                        <span className="text-xs text-muted-foreground">Student only</span>
                      )}
                    </td>
                    <td className="px-2 py-3 min-w-[220px] text-xs text-slate-gray/80">
                      <p>
                        <span className="font-medium text-slate-gray">Created:</span>{" "}
                        {formatDate(user.created_at)}
                      </p>
                      <p className="mt-1">
                        <span className="font-medium text-slate-gray">Last login:</span>{" "}
                        {formatDateTime(user.last_sign_in_at)}
                      </p>
                    </td>

                    
                    <td className="px-2 py-3 min-w-[150px]">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => void saveUser(user)}
                          className={`${PRIMARY_BTN_CLASS} px-3.5 py-2 text-xs`}
                          style={SAVE_BTN_STYLE}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => void deleteUser(user.id)}
                          className="inline-flex items-center justify-center rounded-full border border-error-border px-3.5 py-2 text-xs font-semibold text-error transition-colors hover:bg-error-light"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && totalUsers > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4 text-sm">
            <p className="text-muted-foreground">
              Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, totalUsers)} of{" "}
              {totalUsers}
            </p>
            <div className="flex items-center gap-2">
              <label className="text-muted-foreground" htmlFor="account-page-size">
                Rows
              </label>
              <select
                id="account-page-size"
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value) as 25 | 50 | 100)}
                className="rounded-xl px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                style={INPUT_STYLE}
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <button
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
                className={`${SECONDARY_BTN_CLASS} px-3.5 py-1.5 text-sm`}
                style={SECONDARY_BTN_STYLE}
              >
                Previous
              </button>
              <span className="text-muted-foreground">
                Page {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages}
                className={`${SECONDARY_BTN_CLASS} px-3.5 py-1.5 text-sm`}
                style={SECONDARY_BTN_STYLE}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowCreateModal(false)}
          />
          <div
            className="relative mx-4 w-full max-w-md rounded-2xl"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--assignment-glass-border)",
              boxShadow: "var(--assignment-popover-shadow)",
            }}
          >
            <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
              <h2 className="font-heading text-lg font-bold text-slate-gray">
                Create Staff Account
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-surface-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form className="p-5 space-y-4" onSubmit={createStaffUser}>
              <label className="block text-sm text-slate-gray">
                <span className="mb-1 block font-semibold">Email</span>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, email: e.target.value }))
                  }
                  placeholder="teacher@school.example"
                  className={INPUT_CLASS}
                  style={INPUT_STYLE}
                  required
                />
              </label>
              <label className="block text-sm text-slate-gray">
                <span className="mb-1 block font-semibold">Display Name</span>
                <input
                  value={createForm.displayName}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, displayName: e.target.value }))
                  }
                  className={INPUT_CLASS}
                  style={INPUT_STYLE}
                />
              </label>
              <label className="block text-sm text-slate-gray">
                <span className="mb-1 block font-semibold">Password</span>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, password: e.target.value }))
                  }
                  className={INPUT_CLASS}
                  style={INPUT_STYLE}
                  required
                />
              </label>
              <label className="block text-sm text-slate-gray">
                <span className="mb-1 block font-semibold">Role</span>
                <select
                  value={createForm.role}
                  onChange={(e) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      role: e.target.value as "teacher" | "admin",
                      schoolId: e.target.value === "teacher" ? prev.schoolId : "",
                    }))
                  }
                  className={INPUT_CLASS}
                  style={INPUT_STYLE}
                >
                  <option value="teacher">teacher</option>
                  <option value="admin">admin</option>
                </select>
              </label>
              {createForm.role === "teacher" && (
                <label className="block text-sm text-slate-gray">
                  <span className="mb-1 block font-semibold">School (optional)</span>
                  <select
                    value={createForm.schoolId}
                    onChange={(event) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        schoolId: event.target.value,
                      }))
                    }
                    className={INPUT_CLASS}
                    style={INPUT_STYLE}
                  >
                    <option value="">Unassigned</option>
                    {schools.map((school) => (
                      <option key={school.id} value={school.id}>
                        {school.name}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    You can assign or move this teacher later from Account Management.
                  </span>
                </label>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-surface-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className={`${PRIMARY_BTN_CLASS} px-5 py-2 text-sm`}
                  style={PRIMARY_BTN_STYLE}
                >
                  {isCreating ? "Creating..." : "Create Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
