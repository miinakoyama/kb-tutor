"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Plus, School, Trash2, Users, X } from "lucide-react";
import { formatExamDate } from "@/lib/keystone-exam";
import { alertSuccess, badgeAmber } from "@/lib/ui/status-badge-styles";

interface ProfileOption {
  id: string;
  email: string;
  student_id: string | null;
  display_name: string | null;
  role: "student" | "teacher" | "admin";
}

interface SchoolView {
  id: string;
  name: string;
  teacher_user_id: string | null;
  keystone_exam_date: string | null;
  is_hidden: boolean;
  student_login_notice: string | null;
  teacher_label: string;
  teachers: { id: string; label: string; is_primary: boolean }[];
  students: { id: string; label: string }[];
}

function normalizeAdminError(message?: string) {
  if (!message) return "Failed to load admin data.";
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
  "w-full rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40";

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

export default function SchoolManagementPage() {
  const [teachers, setTeachers] = useState<ProfileOption[]>([]);
  const [schools, setSchools] = useState<SchoolView[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState({
    name: "",
    teacherUserIds: [] as string[],
    keystoneExamDate: "",
    studentLoginNotice: "",
    isHidden: false,
  });

  const selectedSchool = useMemo(
    () => (selectedSchoolId ? schools.find((s) => s.id === selectedSchoolId) ?? null : null),
    [schools, selectedSchoolId],
  );

  const [editName, setEditName] = useState("");
  const [editTeacherIds, setEditTeacherIds] = useState<string[]>([]);
  const [editKeystoneExamDate, setEditKeystoneExamDate] = useState("");
  const [editStudentLoginNotice, setEditStudentLoginNotice] = useState("");
  const [editIsHidden, setEditIsHidden] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    const school = selectedSchool;
    if (!school) return;
    setEditName(school.name);
    setEditTeacherIds(school.teachers.map((t) => t.id));
    setEditKeystoneExamDate(school.keystone_exam_date ?? "");
    setEditStudentLoginNotice(school.student_login_notice ?? "");
    setEditIsHidden(school.is_hidden);
    setEditError(null);
  }, [selectedSchoolId, selectedSchool]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [teacherRes, schoolRes] = await Promise.all([
      fetch("/api/admin/users?role=teacher", { cache: "no-store" }),
      fetch("/api/admin/schools", { cache: "no-store" }),
    ]);

    const teacherPayload = (await teacherRes.json()) as { users?: ProfileOption[]; error?: string };
    const schoolPayload = (await schoolRes.json()) as { schools?: SchoolView[]; error?: string };

    if (!teacherRes.ok || !schoolRes.ok) {
      setError(
        normalizeAdminError(teacherPayload.error || schoolPayload.error || "Failed to load data."),
      );
      setLoading(false);
      return;
    }

    setTeachers(teacherPayload.users ?? []);
    setSchools(schoolPayload.schools ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  function resetCreateForm() {
    setCreateForm({
      name: "",
      teacherUserIds: [],
      keystoneExamDate: "",
      studentLoginNotice: "",
      isHidden: false,
    });
  }

  function openCreateModal() {
    setCreateError(null);
    setShowCreateModal(true);
  }

  function closeCreateModal() {
    setCreateError(null);
    setShowCreateModal(false);
  }

  function closeEditModal() {
    setEditError(null);
    setSelectedSchoolId(null);
  }

  async function createSchool(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    setCreateError(null);
    const response = await fetch("/api/admin/schools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: createForm.name.trim(),
        teacherUserIds: createForm.teacherUserIds,
        keystoneExamDate: createForm.keystoneExamDate.trim() || null,
        studentLoginNotice: createForm.studentLoginNotice.trim() || null,
        isHidden: createForm.isHidden,
      }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      const nextError = normalizeAdminError(payload.error) || "Failed to create school.";
      setCreateError(nextError);
      setError(nextError);
      return;
    }
    setMessage("School created.");
    closeCreateModal();
    resetCreateForm();
    await loadAll();
  }

  async function saveSchool() {
    if (!selectedSchool) return;
    setMessage(null);
    setError(null);
    setEditError(null);
    const response = await fetch("/api/admin/schools", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: selectedSchool.id,
        name: editName.trim(),
        teacherUserIds: editTeacherIds,
        keystoneExamDate: editKeystoneExamDate.trim() || null,
        studentLoginNotice: editStudentLoginNotice.trim() || null,
        isHidden: editIsHidden,
      }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      const nextError = normalizeAdminError(payload.error) || "Failed to update school.";
      setEditError(nextError);
      setError(nextError);
      return;
    }
    setMessage("School updated.");
    closeEditModal();
    await loadAll();
  }

  async function deleteSchool() {
    if (!selectedSchool) return;
    if (!confirm(`Delete school "${selectedSchool.name}"? This will also delete all associated assignments and student data.`)) return;
    setMessage(null);
    setError(null);
    setEditError(null);
    const response = await fetch("/api/admin/schools", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: selectedSchool.id }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      const nextError = normalizeAdminError(payload.error) || "Failed to delete school.";
      setEditError(nextError);
      setError(nextError);
      return;
    }
    setMessage("School deleted.");
    closeEditModal();
    await loadAll();
  }

  return (
    <main
      className="mx-auto w-full px-4 py-10 sm:px-6 sm:py-12 lg:px-10 lg:py-14 xl:px-12"
      style={{ maxWidth: 1500 }}
    >
      <header className="mb-10 flex items-center justify-between gap-4">
        <h1 className="font-heading text-2xl font-bold text-heading sm:text-3xl">
          School Management
        </h1>
        <button
          onClick={openCreateModal}
          className={`${PRIMARY_BTN_CLASS} h-12 flex-shrink-0 gap-2.5 px-6 text-base`}
          style={PRIMARY_BTN_STYLE}
        >
          <Plus className="h-5 w-5" />
          Create School
        </button>
      </header>

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

      <section className="overflow-hidden rounded-2xl" style={CARD_STYLE}>
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading schools...</div>
        ) : schools.length === 0 ? (
          <div className="p-8 text-center">
            <School className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
            <p className="mb-4 text-muted-foreground">No schools yet.</p>
            <button
              onClick={openCreateModal}
              className={`${PRIMARY_BTN_CLASS} px-5 py-2.5 text-sm`}
              style={PRIMARY_BTN_STYLE}
            >
              <Plus className="h-4 w-4" />
              Create your first school
            </button>
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {schools.map((school) => (
              <article
                key={school.id}
                className="p-4 sm:p-5 hover:bg-surface-muted/50 transition-colors cursor-pointer"
                onClick={() => setSelectedSchoolId(school.id)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-slate-gray truncate mb-1">
                      {school.name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        {school.students.length} students
                      </span>
                      {school.teacher_label && (
                        <span>Teachers: {school.teacher_label}</span>
                      )}
                      {school.keystone_exam_date && (
                        <span className="inline-flex items-center gap-1 text-amber-700">
                          <CalendarDays className="w-3.5 h-3.5" />
                          Keystone exam: {formatExamDate(school.keystone_exam_date)}
                        </span>
                      )}
                      {school.is_hidden && (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeAmber}`}>
                          Hidden on student login
                        </span>
                      )}
                      <span className="text-muted-foreground text-xs">ID: {school.id}</span>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeCreateModal}
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
              <h2 className="font-heading text-lg font-bold text-slate-gray">Create School</h2>
              <button
                onClick={closeCreateModal}
                className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-surface-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form className="p-5 space-y-4" onSubmit={createSchool}>
              {createError && (
                <p
                  role="alert"
                  className="rounded-xl border border-error-border bg-error-light px-3.5 py-2.5 text-sm text-error"
                >
                  {createError}
                </p>
              )}
              <label className="block text-sm text-slate-gray">
                <span className="mb-1 block font-semibold">School Name</span>
                <input
                  placeholder="e.g. Greenfield High School"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
                  className={INPUT_CLASS}
                  style={INPUT_STYLE}
                  required
                />
              </label>
              <label className="block text-sm text-slate-gray">
                <span className="mb-1 block font-semibold">Keystone Exam Date (optional)</span>
                <input
                  type="date"
                  value={createForm.keystoneExamDate}
                  onChange={(e) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      keystoneExamDate: e.target.value,
                    }))
                  }
                  className={INPUT_CLASS}
                  style={INPUT_STYLE}
                />
                <span className="mt-1 block text-xs text-muted-foreground">
                  When set, students see a countdown on their home page.
                </span>
              </label>
              <label className="block text-sm text-slate-gray">
                <span className="mb-1 block font-semibold">Student login notice (optional)</span>
                <textarea
                  rows={4}
                  maxLength={2000}
                  placeholder="e.g. If you forgot your student ID, sign in with your school email or FirstnameLastname."
                  value={createForm.studentLoginNotice}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, studentLoginNotice: e.target.value }))
                  }
                  className={`${INPUT_CLASS} min-h-[88px] resize-y`}
                  style={INPUT_STYLE}
                />
                <span className="mt-1 block text-xs text-muted-foreground">
                  Shown on the student login page below Student ID when this school is selected.
                  Leave empty for no extra message.
                </span>
              </label>
              <label className="block text-sm text-slate-gray">
                <span className="mb-1 block font-semibold">Teachers (optional)</span>
                <div className="max-h-40 space-y-2 overflow-y-auto rounded-xl border border-border-default p-3">
                  {teachers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No teachers available. Create teacher accounts first.</p>
                  ) : (
                    teachers.map((teacher) => {
                      const checked = createForm.teacherUserIds.includes(teacher.id);
                      return (
                        <label
                          key={teacher.id}
                          className="flex items-center gap-2 text-sm text-slate-gray"
                        >
                          <input
                            type="checkbox"
                            className="accent-[var(--assignment-completed)]"
                            checked={checked}
                            onChange={(e) => {
                              setCreateForm((prev) => ({
                                ...prev,
                                teacherUserIds: e.target.checked
                                  ? [...prev.teacherUserIds, teacher.id]
                                  : prev.teacherUserIds.filter((id) => id !== teacher.id),
                              }));
                            }}
                          />
                          <span>{teacher.display_name || teacher.email}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </label>
              <label className="flex items-start gap-3 rounded-xl border border-border-default p-3 text-sm text-slate-gray">
                <input
                  type="checkbox"
                  checked={createForm.isHidden}
                  onChange={(e) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      isHidden: e.target.checked,
                    }))
                  }
                  className="mt-0.5 accent-[var(--assignment-completed)]"
                />
                <span>
                  <span className="block font-medium">Hide from student login</span>
                  <span className="block text-xs text-muted-foreground">
                    Hidden schools are not shown on the student login page.
                  </span>
                </span>
              </label>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-surface-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`${PRIMARY_BTN_CLASS} px-5 py-2 text-sm`}
                  style={PRIMARY_BTN_STYLE}
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedSchool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeEditModal}
          />
          <div
            className="relative mx-4 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--assignment-glass-border)",
              boxShadow: "var(--assignment-popover-shadow)",
            }}
          >
            <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
              <h2 className="font-heading text-lg font-bold text-slate-gray">Edit School</h2>
              <button
                onClick={closeEditModal}
                className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-surface-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {editError && (
                <p
                  role="alert"
                  className="rounded-xl border border-error-border bg-error-light px-3.5 py-2.5 text-sm text-error"
                >
                  {editError}
                </p>
              )}
              <label className="block text-sm text-slate-gray">
                <span className="mb-1 block font-semibold">School Name</span>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className={INPUT_CLASS}
                  style={INPUT_STYLE}
                />
              </label>
              <label className="block text-sm text-slate-gray">
                <span className="mb-1 block font-semibold">Keystone Exam Date</span>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={editKeystoneExamDate}
                    onChange={(e) => setEditKeystoneExamDate(e.target.value)}
                    className={`${INPUT_CLASS} flex-1`}
                    style={INPUT_STYLE}
                  />
                  {editKeystoneExamDate && (
                    <button
                      type="button"
                      onClick={() => setEditKeystoneExamDate("")}
                      className={`${SECONDARY_BTN_CLASS} px-3.5 py-2 text-xs`}
                      style={SECONDARY_BTN_STYLE}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Leave empty to hide the countdown on student home pages.
                </span>
              </label>
              <label className="block text-sm text-slate-gray">
                <span className="mb-1 block font-semibold">Student login notice</span>
                <textarea
                  rows={4}
                  maxLength={2000}
                  placeholder="Optional message for students on /login"
                  value={editStudentLoginNotice}
                  onChange={(e) => setEditStudentLoginNotice(e.target.value)}
                  className={`${INPUT_CLASS} min-h-[88px] resize-y`}
                  style={INPUT_STYLE}
                />
                <span className="mt-1 block text-xs text-muted-foreground">
                  Shown below Student ID when this school is chosen. Clear the text and save to remove.
                </span>
              </label>
              <label className="block text-sm text-slate-gray">
                <span className="mb-1 block font-semibold">Teachers</span>
                <div className="max-h-40 space-y-2 overflow-y-auto rounded-xl border border-border-default p-3">
                  {teachers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No teachers available.</p>
                  ) : (
                    teachers.map((teacher) => {
                      const checked = editTeacherIds.includes(teacher.id);
                      return (
                        <label
                          key={teacher.id}
                          className="flex items-center gap-2 text-sm text-slate-gray"
                        >
                          <input
                            type="checkbox"
                            className="accent-[var(--assignment-completed)]"
                            checked={checked}
                            onChange={(e) => {
                              setEditTeacherIds((prev) =>
                                e.target.checked
                                  ? [...prev, teacher.id]
                                  : prev.filter((id) => id !== teacher.id),
                              );
                            }}
                          />
                          <span>{teacher.display_name || teacher.email}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </label>
              <label className="flex items-start gap-3 rounded-xl border border-border-default p-3 text-sm text-slate-gray">
                <input
                  type="checkbox"
                  checked={editIsHidden}
                  onChange={(e) => setEditIsHidden(e.target.checked)}
                  className="mt-0.5 accent-[var(--assignment-completed)]"
                />
                <span>
                  <span className="block font-medium">Hide from student login</span>
                  <span className="block text-xs text-muted-foreground">
                    Hidden schools are excluded from the student login dropdown.
                  </span>
                </span>
              </label>

              <div>
                <p className="mb-2 text-sm font-semibold text-slate-gray">
                  Students ({selectedSchool.students.length} enrolled)
                </p>
                <p className="text-xs text-muted-foreground">
                  Students are enrolled automatically when they log in with this school selected.
                </p>
                {selectedSchool.students.length > 0 && (
                  <div className="mt-2 max-h-32 space-y-1 overflow-y-auto rounded-xl border border-border-default p-3">
                    {selectedSchool.students.map((student) => (
                      <p key={student.id} className="text-sm text-slate-gray">
                        {student.label}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => void deleteSchool()}
                  className="inline-flex items-center gap-1.5 rounded-full border border-error-border px-3.5 py-2 text-sm font-semibold text-error transition-colors hover:bg-error-light"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={closeEditModal}
                    className="inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-surface-muted"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => void saveSchool()}
                    className={`${PRIMARY_BTN_CLASS} px-5 py-2 text-sm`}
                    style={SAVE_BTN_STYLE}
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
