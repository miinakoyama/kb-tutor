"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";

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

export default function AccountManagementPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
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
    setUsers(payload.users ?? []);
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
      }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(normalizeAdminError(payload.error, "Failed to update user."));
      return;
    }
    setMessage("User updated.");
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
        }),
      });
      const payload = (await response.json()) as { error?: string; email?: string };
      if (!response.ok) {
        setError(normalizeAdminError(payload.error, "Failed to create user."));
        return;
      }

      setMessage(`Account created: ${payload.email ?? createForm.email}`);
      setShowCreateModal(false);
      setCreateForm({ email: "", displayName: "", password: "", role: "teacher" });
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
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <header className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading text-[#14532d] mb-2">
            Account Management
          </h1>
          <p className="text-slate-gray/70">
            Manage teacher and admin accounts. Students are registered automatically when they first log in.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#16a34a] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#15803d] transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Create Staff Account
        </button>
      </header>

      <section className="rounded-xl border border-[#16a34a]/25 bg-white p-4 sm:p-5 shadow-sm mb-6">
  <div className="flex flex-wrap items-end gap-4">
    <label className="text-sm text-slate-gray">
      <span className="block mb-1 font-medium">Role filter</span>
      <select
        value={roleFilter}
        onChange={(event) => setRoleFilter(event.target.value as "all" | Role)}
        className="rounded-lg border border-slate-200 px-3 py-2"
      >
        <option value="all">All roles</option>
        <option value="student">student</option>
        <option value="teacher">teacher</option>
        <option value="admin">admin</option>
      </select>
    </label>

    <label className="text-sm text-slate-gray">
      <span className="block mb-1 font-medium">Analytics filter</span>
      <select
        value={analyticsFilter}
        onChange={(event) =>
          setAnalyticsFilter(event.target.value as "all" | "included" | "excluded")
        }
        className="rounded-lg border border-slate-200 px-3 py-2"
      >
        <option value="all">All users</option>
        <option value="included">Included in analytics</option>
        <option value="excluded">Excluded from analytics</option>
      </select>
    </label>

    <label className="text-sm text-slate-gray">
      <span className="block mb-1 font-medium">School filter</span>
      <select
        value={schoolFilter}
        onChange={(event) => setSchoolFilter(event.target.value)}
        className="rounded-lg border border-slate-200 px-3 py-2"
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

  <p className="mt-3 text-xs text-slate-gray/70">
    Users marked as &quot;Excluded from analytics&quot; are skipped when computing teacher dashboard
    metrics and assignment response counts. This setting applies to student accounts only. Use this
    for developer or test accounts whose data should not affect reporting.
  </p>
</section>


      {message && (
        <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 mb-4">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 mb-4">
          {error}
        </p>
      )}

      <section className="rounded-xl border border-[#16a34a]/25 bg-white p-4 sm:p-5 shadow-sm">
        {loading ? (
          <p className="text-sm text-slate-gray/70">Loading users...</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-slate-gray/70">No users found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
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
                  <tr key={user.id} className="border-b border-slate-100 align-top">
                    <td className="px-2 py-3 min-w-[140px]">
                      <input
                        value={user.student_id ?? ""}
                        onChange={(e) =>
                          updateLocalUser(user.id, { student_id: e.target.value || null })
                        }
                        className="w-full rounded-lg border border-slate-200 px-2.5 py-2"
                      />
                    </td>
                    <td className="px-2 py-3 min-w-[180px]">
                      <input
                        value={user.display_name ?? ""}
                        onChange={(e) =>
                          updateLocalUser(user.id, { display_name: e.target.value || null })
                        }
                        className="w-full rounded-lg border border-slate-200 px-2.5 py-2"
                      />
                    </td>
                    <td className="px-2 py-3 min-w-[130px]">
                      <select
                        value={user.role}
                        onChange={(e) =>
                          updateLocalUser(user.id, { role: e.target.value as Role })
                        }
                        className="w-full rounded-lg border border-slate-200 px-2.5 py-2"
                      >
                        <option value="student">student</option>
                        <option value="teacher">teacher</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td className="px-2 py-3 min-w-[220px] break-all text-slate-gray">
                      {user.email}
                    </td>
                    
                    <td className="px-2 py-3 min-w-[140px] max-w-[180px] whitespace-normal break-words text-slate-gray">
                      {user.school_names && user.school_names.length > 0 ? user.school_names.join(", ") : "—"}
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
                            className="h-4 w-4 rounded border-slate-300 text-[#16a34a] focus:ring-[#16a34a]"
                          />
                          <span className="text-xs text-slate-gray/80">
                            {user.excluded_from_analytics ? "Excluded" : "Included"}
                          </span>
                        </label>
                      ) : (
                        <span className="text-xs text-slate-gray/60">Student only</span>
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
                          className="rounded-lg bg-[#16a34a] px-3 py-2 text-xs font-medium text-white hover:bg-[#15803d] transition-colors"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => void deleteUser(user.id)}
                          className="rounded-lg border border-red-300 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 transition-colors"
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
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm">
            <p className="text-slate-gray/70">
              Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, totalUsers)} of{" "}
              {totalUsers}
            </p>
            <div className="flex items-center gap-2">
              <label className="text-slate-gray/70" htmlFor="account-page-size">
                Rows
              </label>
              <select
                id="account-page-size"
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value) as 25 | 50 | 100)}
                className="rounded-lg border border-slate-200 px-2 py-1.5"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <button
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
                className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-slate-gray/70">
                Page {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages}
                className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-50"
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
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-gray">Create Staff Account</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form className="p-5 space-y-4" onSubmit={createStaffUser}>
              <label className="block text-sm text-slate-gray">
                <span className="block mb-1 font-medium">Email</span>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, email: e.target.value }))
                  }
                  placeholder="teacher@school.example"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  required
                />
              </label>
              <label className="block text-sm text-slate-gray">
                <span className="block mb-1 font-medium">Display Name</span>
                <input
                  value={createForm.displayName}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, displayName: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                />
              </label>
              <label className="block text-sm text-slate-gray">
                <span className="block mb-1 font-medium">Password</span>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, password: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  required
                />
              </label>
              <label className="block text-sm text-slate-gray">
                <span className="block mb-1 font-medium">Role</span>
                <select
                  value={createForm.role}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, role: e.target.value as "teacher" | "admin" }))
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                >
                  <option value="teacher">teacher</option>
                  <option value="admin">admin</option>
                </select>
              </label>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="rounded-lg bg-[#16a34a] px-4 py-2 text-sm font-medium text-white hover:bg-[#15803d] disabled:opacity-60 transition-colors"
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
