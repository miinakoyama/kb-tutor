"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Plus, School, Trash2, X } from "lucide-react";

interface TeacherClassRow {
  id: string;
  name: string;
  grade: number | null;
  teacher_user_id: string;
  created_at: string;
  member_count: number;
}

export default function TeacherClassManagementPage() {
  const [classes, setClasses] = useState<TeacherClassRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newClassName, setNewClassName] = useState("");

  const [editingClass, setEditingClass] = useState<TeacherClassRow | null>(null);
  const [editName, setEditName] = useState("");

  const loadClasses = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const response = await fetch("/api/teacher/classes", { cache: "no-store" });
    const payload = (await response.json()) as {
      classes?: TeacherClassRow[];
      error?: string;
    };
    if (!response.ok) {
      setError(payload.error ?? "Failed to load classes.");
      setIsLoading(false);
      return;
    }
    setClasses(payload.classes ?? []);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadClasses();
  }, [loadClasses]);

  async function handleCreateClass(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    const name = newClassName.trim();
    if (!name) {
      setError("Class name is required.");
      return;
    }

    setIsSubmitting(true);
    const response = await fetch("/api/teacher/classes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
      }),
    });
    const payload = (await response.json()) as { error?: string };
    setIsSubmitting(false);

    if (!response.ok) {
      setError(payload.error ?? "Failed to create class.");
      return;
    }

    setMessage(`Class "${name}" created.`);
    setShowCreateModal(false);
    setNewClassName("");
    await loadClasses();
  }

  async function handleSaveClass() {
    if (!editingClass) return;
    setMessage(null);
    setError(null);
    const response = await fetch("/api/teacher/classes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingClass.id,
        name: editName.trim(),
      }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Failed to update class.");
      return;
    }
    setMessage("Class updated.");
    setEditingClass(null);
    await loadClasses();
  }

  async function handleDeleteClass(classId: string, className: string) {
    if (!confirm(`Delete class "${className}"?`)) return;
    setMessage(null);
    setError(null);
    const response = await fetch("/api/teacher/classes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: classId }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Failed to delete class.");
      return;
    }
    setMessage("Class deleted.");
    setClasses((prev) => prev.filter((item) => item.id !== classId));
  }

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading text-[#14532d] mb-1">
            Class Management
          </h1>
          <p className="text-slate-gray/70 text-sm">
            Manage your classes and create assignments per class.
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
        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-gray/70">
            Loading classes...
          </div>
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
              <article key={classItem.id} className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-slate-gray">
                      {classItem.name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-gray/70 mt-1">
                      <span>{classItem.member_count} students</span>
                      <span className="text-xs text-slate-gray/50">ID: {classItem.id}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/assignments/manage?classId=${encodeURIComponent(classItem.id)}`}
                      className="rounded-lg bg-[#16a34a] px-3 py-2 text-xs font-medium text-white hover:bg-[#15803d] transition-colors"
                    >
                      Create Assignment
                    </Link>
                    <button
                      onClick={() => {
                        setEditingClass(classItem);
                        setEditName(classItem.name);
                      }}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => void handleDeleteClass(classItem.id, classItem.name)}
                      className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowCreateModal(false)} />
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
            <form className="p-5 space-y-4" onSubmit={handleCreateClass}>
              <label className="block text-sm text-slate-gray">
                <span className="block mb-1 font-medium">Class Name</span>
                <input
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  required
                />
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
                  disabled={isSubmitting}
                  className="rounded-lg bg-[#16a34a] px-4 py-2 text-sm font-medium text-white hover:bg-[#15803d] disabled:opacity-60 transition-colors"
                >
                  {isSubmitting ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditingClass(null)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-gray">Edit Class</h2>
              <button
                onClick={() => setEditingClass(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <label className="block text-sm text-slate-gray">
                <span className="block mb-1 font-medium">Class Name</span>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                />
              </label>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingClass(null)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleSaveClass()}
                  className="rounded-lg bg-[#16a34a] px-4 py-2 text-sm font-medium text-white hover:bg-[#15803d] transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
