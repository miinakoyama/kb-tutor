"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ShieldAlert, Home } from "lucide-react";
import type { UserRole } from "@/lib/user-role";
import { getStoredUserRole } from "@/lib/user-role";

interface RoleGateProps {
  allow: UserRole[];
  children: ReactNode;
}

export function RoleGate({ allow, children }: RoleGateProps) {
  const role = getStoredUserRole();
  if (allow.includes(role)) {
    return <>{children}</>;
  }

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <section className="rounded-xl border border-amber-300 bg-amber-50 p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-6 h-6 text-amber-600 mt-0.5" />
          <div className="space-y-3">
            <h1 className="text-xl font-semibold text-amber-900">Access Restricted</h1>
            <p className="text-sm text-amber-800">
              This page is available to teacher accounts only. Switch role in Settings for demo mode.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#16a34a] text-white text-sm font-medium hover:bg-[#15803d] transition-colors"
            >
              <Home className="w-4 h-4" />
              Back to Home
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
