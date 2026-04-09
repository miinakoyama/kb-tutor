"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { MigrationBootstrap } from "@/components/MigrationBootstrap";

export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideNavigationChrome = pathname === "/login";

  return (
    <>
      <MigrationBootstrap />
      {!hideNavigationChrome && <Sidebar />}
      <div
        className={
          hideNavigationChrome
            ? "min-h-screen"
            : "min-h-screen pt-16 pl-14 lg:pt-0 lg:pl-64"
        }
      >
        {children}
      </div>
    </>
  );
}

