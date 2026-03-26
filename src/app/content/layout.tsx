"use client";

import type { ReactNode } from "react";
import { RoleGate } from "@/components/shared/RoleGate";

export default function ContentLayout({ children }: { children: ReactNode }) {
  return <RoleGate allow={["teacher"]}>{children}</RoleGate>;
}
