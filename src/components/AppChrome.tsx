"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { MigrationBootstrap } from "@/components/MigrationBootstrap";

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
      {!hideNavigationChrome && (
        <Sidebar isCollapsed={sidebarCollapsed} onToggle={handleToggleSidebar} />
      )}
      <div
        className={
          hideNavigationChrome
            ? "min-h-screen"
            : `min-h-screen pt-16 pl-14 lg:pt-0 transition-all duration-300 ${
                sidebarCollapsed ? "lg:pl-14" : "lg:pl-64"
              }`
        }
      >
        {children}
      </div>

      <div className="fixed bottom-0 right-0 pointer-events-none opacity-10 translate-x-1/4 translate-y-1/4">
        <svg
          width="400"
          height="400"
          viewBox="0 0 24 24"
          fill="#166534"
          aria-hidden="true"
        >
          <path d="M17,8C8,10 5.9,16.17 3.82,21.34L5.71,22L6.66,19.7C7.14,19.87 7.64,20 8,20C19,20 22,3 22,3C21,5 14,5.25 9,6.25C4,7.25 2,11.5 2,13.5C2,15.5 3.75,17.25 3.75,17.25C7,11 17,8 17,8Z" />
        </svg>
      </div>
    </>
  );
}
