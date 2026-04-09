"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, School, Trash2, Users, X } from "lucide-react";

interface ProfileOption {
  id: string;
  email: string;
  student_id: string | null;
  display_name: string | null;
  role: "student" | "teacher" | "admin";
}

interface ClassView {
  id: string;
  name: string;
  grade: number | null;
  teacher_user_id: string;
  teacher_label: string;
  students: { id: string; label: string }[];
}

function normalizeAdminError(message?: string) {
  if (!message) return "Failed to load admin data.";
  if (message === "Forbidden") {
    return "Forbidden: Could not verify admin privileges. Check whether profiles.role or metadata.role is set to admin.";
  }
  return message;
}

export default function ClassManagementPage() {
  const [teachers, setTeachers] = useState<ProfileOption[]>([]);
  const [students, setStudents] = useState<ProfileOption[]>([]);
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [createForm, setCreateForm] = useState({
    id: "",
    name: "",
    grade: "",
    teacherUserId: "",
  });

  const selectedClass = useMemo(
    () => (selectedClassId ? classes.find((item) => item.id === selectedClassId) ?? null : null),
    [classes, selectedClassId],
  );

  const [editName, setEditName] = useState("");
  const [editGrade, setEditGrade] = useState("");
  const [editTeacher, setEditTeacher] = useState("");
  const [editStudentIds, setEditStudentIds] = useState<string[]>([]);

  useEffect(() => {
    const cls = selectedClass;
    if (!cls) return;
    setEditName(cls.name);
    setEditGrade(cls.grade !== null ? String(cls.grade) : "");
    setEditTeacher(cls.teacher_user_id);
    setEditStudentIds(cls.students.map((student) => student.id));
  }, [selectedClassId, selectedClass]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [teacherRes, studentRes, classRes] = await Promise.all([
      fetch("/api/admin/users?role=teacher", { cache: "no-store" }),
      fetch("/api/admin/users?role=student", { cache: "no-store" }),
      fetch("/api/admin/classes", { cache: "no-store" }),
    ]);

    const teacherPayload = (await teacherRes.json()) as { users?: ProfileOption[]; error?: string };
    const studentPayload = (await studentRes.json()) as { users?: ProfileOption[]; error?: string };
    const classPayload = (await classRes.json()) as { classes?: ClassView[]; error?: string };

    if (!teacherRes.ok || !studentRes.ok || !classRes.ok) {
      setError(
        normalizeAdminError(
          teacherPayload.error ||
            studentPayload.error ||
            classPayload.error ||
            "Failed to load admin data.",
        ),
      );
      setLoading(false);
      return;
    }

    setTeachers(teacherPayload.users ?? []);
    setStudents(studentPayload.users ?? []);
    setClasses(classPayload.classes ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  function resetCreateForm() {
    setCreateForm({ id: "", name: "", grade: "", teacherUserId: "" });
  }

  async function createClass(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    const response = await fetch("/api/admin/classes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: createForm.id.trim(),
        name: createForm.name.trim(),
        grade: createForm.grade ? Number(createForm.grade) : null,
        teacherUserId: createForm.teacherUserId,
      }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(normalizeAdminError(payload.error) || "Failed to create class.");
      return;
    }
    setMessage("Class created.");
    setShowCreateModal(false);
    resetCreateForm();
    await loadAll();
  }

  async function saveClass() {
    if (!selectedClass) return;
    setMessage(null);
    setError(null);
    const response = await fetch("/api/admin/classes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: selectedClass.id,
        name: editName.trim(),
        grade: editGrade ? Number(editGrade) : null,
        teacherUserId: editTeacher,
        studentUserIds: editStudentIds,
      }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(normalizeAdminError(payload.error) || "Failed to update class.");
      return;
    }
    setMessage("Class updated.");
    setSelectedClassId(null);
    await loadAll();
  }

  async function deleteClass() {
    if (!selectedClass) return;
    if (!confirm(`Delete class "${selectedClass.name}"?`)) return;
    setMessage(null);
    setError(null);
    const response = await fetch("/api/admin/classes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: selectedClass.id }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(normalizeAdminError(payload.error) || "Failed to delete class.");
      return;
    }
    setMessage("Class deleted.");
    setSelectedClassId(null);
    await loadAll();
  }

  function studentLabel(profile: ProfileOption) {
    return profile.display_name || profile.student_id || profile.email;
  }

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading text-[#14532d] mb-1">
            Class Management
          </h1>
          <p className="text-slate-gray/70 text-sm">
            Create classes, assign teachers, and manage student rosters.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#16a34a] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#15803d] transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Create Class
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
          <div className="p-8 text-center text-sm text-slate-gray/70">Loading classes...</div>
        ) : classes.length === 0 ? (
          <div className="p-8 text-center">
            <School className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-gray/70 mb-4">No classes yet.</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-[#16a34a] px-4 py-2 text-sm font-medium text-white hover:bg-[#15803d] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create your first class
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {classes.map((classItem) => (
              <article
                key={classItem.id}
                className="p-4 sm:p-5 hover:bg-slate-50/50 transition-colors cursor-pointer"
                onClick={() => setSelectedClassId(classItem.id)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-base font-semibold text-slate-gray truncate">
                        {classItem.name}
                      </h3>
                      {classItem.grade !== null && (
                        <span className="flex-shrink-0 inline-flex items-center text-xs font-medium text-[#16a34a] bg-[#16a34a]/10 px-2 py-0.5 rounded-full">
                          Grade {classItem.grade}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-gray/70">
                      <span className="inline-flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        {classItem.students.length} students
                      </span>
                      <span>Teacher: {classItem.teacher_label}</span>
                      <span className="text-slate-gray/50 text-xs">ID: {classItem.id}</span>
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
            onClick={() => setShowCreateModal(false)}
          />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-gray">Create Class</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form className="p-5 space-y-4" onSubmit={createClass}>
              <label className="block text-sm text-slate-gray">
                <span className="block mb-1 font-medium">Class ID</span>
                <input
                  placeholder="e.g. bio_p1"
                  value={createForm.id}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, id: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-[#16a34a]/20 focus:border-[#16a34a] outline-none transition-colors"
                  required
                />
              </label>
              <label className="block text-sm text-slate-gray">
                <span className="block mb-1 font-medium">Class Name</span>
                <input
                  placeholder="e.g. Biology Period 1"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-[#16a34a]/20 focus:border-[#16a34a] outline-none transition-colors"
                  required
                />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="block text-sm text-slate-gray">
                  <span className="block mb-1 font-medium">Grade (optional)</span>
                  <input
                    placeholder="e.g. 10"
                    value={createForm.grade}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, grade: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-[#16a34a]/20 focus:border-[#16a34a] outline-none transition-colors"
                    type="number"
                  />
                </label>
                <label className="block text-sm text-slate-gray">
                  <span className="block mb-1 font-medium">Teacher</span>
                  <select
                    value={createForm.teacherUserId}
                    onChange={(e) =>
                      setCreateForm((prev) => ({ ...prev, teacherUserId: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-[#16a34a]/20 focus:border-[#16a34a] outline-none transition-colors"
                    required
                  >
                    <option value="">Select teacher</option>
                    {teachers.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.display_name || teacher.student_id || teacher.email}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

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
                  className="rounded-lg bg-[#16a34a] px-4 py-2 text-sm font-medium text-white hover:bg-[#15803d] transition-colors"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setSelectedClassId(null)}
          />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-gray">Edit Class</h2>
              <button
                onClick={() => setSelectedClassId(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <label className="block text-sm text-slate-gray">
                  <span className="block mb-1 font-medium">Class Name</span>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-[#16a34a]/20 focus:border-[#16a34a] outline-none transition-colors"
                  />
                </label>
                <label className="block text-sm text-slate-gray">
                  <span className="block mb-1 font-medium">Grade</span>
                  <input
                    value={editGrade}
                    onChange={(e) => setEditGrade(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-[#16a34a]/20 focus:border-[#16a34a] outline-none transition-colors"
                    type="number"
                  />
                </label>
              </div>
              <label className="block text-sm text-slate-gray">
                <span className="block mb-1 font-medium">Teacher</span>
                <select
                  value={editTeacher}
                  onChange={(e) => setEditTeacher(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-[#16a34a]/20 focus:border-[#16a34a] outline-none transition-colors"
                >
                  <option value="">Select teacher</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.display_name || teacher.student_id || teacher.email}
                    </option>
                  ))}
                </select>
              </label>

              <div>
                <p className="text-sm font-medium text-slate-gray mb-2">Students</p>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 p-3 space-y-2">
                  {students.length === 0 ? (
                    <p className="text-sm text-slate-gray/60">No students available.</p>
                  ) : (
                    students.map((student) => {
                      const checked = editStudentIds.includes(student.id);
                      return (
                        <label
                          key={student.id}
                          className="flex items-center gap-2 text-sm text-slate-gray"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setEditStudentIds((prev) =>
                                e.target.checked
                                  ? [...prev, student.id]
                                  : prev.filter((id) => id !== student.id),
                              );
                            }}
                          />
                          <span>{studentLabel(student)}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => void deleteClass()}
                  className="inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-2 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedClassId(null)}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => void saveClass()}
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

