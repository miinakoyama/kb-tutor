"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Plus, School, Trash2, Users, X } from "lucide-react";
import { formatExamDate } from "@/lib/keystone-exam";

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
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading text-[#14532d] mb-1">
            School Management
          </h1>
          <p className="text-slate-gray/70 text-sm">
            Create schools, assign teachers, and control student login visibility.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 rounded-lg bg-[#16a34a] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#15803d] transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Create School
        </button>
      </header>

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

      <section className="rounded-xl border border-[#16a34a]/25 bg-white shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-gray/70">Loading schools...</div>
        ) : schools.length === 0 ? (
          <div className="p-8 text-center">
            <School className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-gray/70 mb-4">No schools yet.</p>
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 rounded-lg bg-[#16a34a] px-4 py-2 text-sm font-medium text-white hover:bg-[#15803d] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create your first school
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {schools.map((school) => (
              <article
                key={school.id}
                className="p-4 sm:p-5 hover:bg-slate-50/50 transition-colors cursor-pointer"
                onClick={() => setSelectedSchoolId(school.id)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-slate-gray truncate mb-1">
                      {school.name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-gray/70">
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
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                          Hidden on student login
                        </span>
                      )}
                      <span className="text-slate-gray/50 text-xs">ID: {school.id}</span>
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
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-gray">Create School</h2>
              <button
                onClick={closeCreateModal}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form className="p-5 space-y-4" onSubmit={createSchool}>
              {createError && (
                <p
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                >
                  {createError}
                </p>
              )}
              <label className="block text-sm text-slate-gray">
                <span className="block mb-1 font-medium">School Name</span>
                <input
                  placeholder="e.g. Greenfield High School"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-[#16a34a]/20 focus:border-[#16a34a] outline-none transition-colors"
                  required
                />
              </label>
              <label className="block text-sm text-slate-gray">
                <span className="block mb-1 font-medium">Keystone Exam Date (optional)</span>
                <input
                  type="date"
                  value={createForm.keystoneExamDate}
                  onChange={(e) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      keystoneExamDate: e.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-[#16a34a]/20 focus:border-[#16a34a] outline-none transition-colors"
                />
                <span className="mt-1 block text-xs text-slate-gray/60">
                  When set, students see a countdown on their home page.
                </span>
              </label>
              <label className="block text-sm text-slate-gray">
                <span className="block mb-1 font-medium">Student login notice (optional)</span>
                <textarea
                  rows={4}
                  maxLength={2000}
                  placeholder="e.g. If you forgot your student ID, sign in with your school email or FirstnameLastname."
                  value={createForm.studentLoginNotice}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, studentLoginNotice: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-[#16a34a]/20 focus:border-[#16a34a] outline-none transition-colors resize-y min-h-[88px]"
                />
                <span className="mt-1 block text-xs text-slate-gray/60">
                  Shown on the student login page below Student ID when this school is selected.
                  Leave empty for no extra message.
                </span>
              </label>
              <label className="block text-sm text-slate-gray">
                <span className="block mb-1 font-medium">Teachers (optional)</span>
                <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 p-3 space-y-2">
                  {teachers.length === 0 ? (
                    <p className="text-sm text-slate-gray/60">No teachers available. Create teacher accounts first.</p>
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
              <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm text-slate-gray">
                <input
                  type="checkbox"
                  checked={createForm.isHidden}
                  onChange={(e) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      isHidden: e.target.checked,
                    }))
                  }
                  className="mt-0.5"
                />
                <span>
                  <span className="block font-medium">Hide from student login</span>
                  <span className="block text-xs text-slate-gray/60">
                    Hidden schools are not shown on the student login page.
                  </span>
                </span>
              </label>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#16a34a] px-4 py-2 text-sm font-medium text-white hover:bg-[#15803d] transition-colors"
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
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-gray">Edit School</h2>
              <button
                onClick={closeEditModal}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {editError && (
                <p
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                >
                  {editError}
                </p>
              )}
              <label className="block text-sm text-slate-gray">
                <span className="block mb-1 font-medium">School Name</span>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-[#16a34a]/20 focus:border-[#16a34a] outline-none transition-colors"
                />
              </label>
              <label className="block text-sm text-slate-gray">
                <span className="block mb-1 font-medium">Keystone Exam Date</span>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={editKeystoneExamDate}
                    onChange={(e) => setEditKeystoneExamDate(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-[#16a34a]/20 focus:border-[#16a34a] outline-none transition-colors"
                  />
                  {editKeystoneExamDate && (
                    <button
                      type="button"
                      onClick={() => setEditKeystoneExamDate("")}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <span className="mt-1 block text-xs text-slate-gray/60">
                  Leave empty to hide the countdown on student home pages.
                </span>
              </label>
              <label className="block text-sm text-slate-gray">
                <span className="block mb-1 font-medium">Student login notice</span>
                <textarea
                  rows={4}
                  maxLength={2000}
                  placeholder="Optional message for students on /login"
                  value={editStudentLoginNotice}
                  onChange={(e) => setEditStudentLoginNotice(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-[#16a34a]/20 focus:border-[#16a34a] outline-none transition-colors resize-y min-h-[88px]"
                />
                <span className="mt-1 block text-xs text-slate-gray/60">
                  Shown below Student ID when this school is chosen. Clear the text and save to remove.
                </span>
              </label>
              <label className="block text-sm text-slate-gray">
                <span className="block mb-1 font-medium">Teachers</span>
                <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 p-3 space-y-2">
                  {teachers.length === 0 ? (
                    <p className="text-sm text-slate-gray/60">No teachers available.</p>
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
              <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm text-slate-gray">
                <input
                  type="checkbox"
                  checked={editIsHidden}
                  onChange={(e) => setEditIsHidden(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block font-medium">Hide from student login</span>
                  <span className="block text-xs text-slate-gray/60">
                    Hidden schools are excluded from the student login dropdown.
                  </span>
                </span>
              </label>

              <div>
                <p className="text-sm font-medium text-slate-gray mb-2">
                  Students ({selectedSchool.students.length} enrolled)
                </p>
                <p className="text-xs text-slate-gray/60">
                  Students are enrolled automatically when they log in with this school selected.
                </p>
                {selectedSchool.students.length > 0 && (
                  <div className="mt-2 max-h-32 overflow-y-auto rounded-lg border border-slate-200 p-3 space-y-1">
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
                  className="inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-2 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={closeEditModal}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => void saveSchool()}
                    className="rounded-lg bg-[#16a34a] px-4 py-2 text-sm font-medium text-white hover:bg-[#15803d] transition-colors"
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
