"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { MigrationBootstrap } from "@/components/MigrationBootstrap";
import { SyncStatusIndicator } from "@/components/SyncStatusIndicator";
import { AllAssignmentsCompleteModalManager } from "@/components/assignments/AllAssignmentsCompleteModalManager";

export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideNavigationChrome = pathname === "/login" || pathname === "/login/staff";
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("sidebarCollapsed");
    if (stored === "true") setSidebarCollapsed(true);
  }, []);

  const handleToggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebarCollapsed", String(next));
      return next;
    });
  };

  return (
    <>
      <MigrationBootstrap />
      {!hideNavigationChrome && <SyncStatusIndicator />}
      {!hideNavigationChrome && (
        <Sidebar isCollapsed={sidebarCollapsed} onToggle={handleToggleSidebar} />
      )}
      <div
        className={
          hideNavigationChrome
            ? "min-h-screen bg-background text-foreground"
            : `min-h-screen bg-background text-foreground pt-16 lg:pt-0 transition-[padding-left] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                sidebarCollapsed ? "lg:pl-14" : "lg:pl-64"
              }`
        }
      >
        {children}
      </div>
      <AllAssignmentsCompleteModalManager />
    </>
  );
}
