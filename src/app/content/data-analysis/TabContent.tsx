"use client";

import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

/**
 * Fades the tab body in on each navigation. Lives inside the persistent
 * Data Analysis layout, so only this content remounts (keyed by pathname)
 * while the title + tabs stay fixed — no header jump on tab switch.
 */
export function TabContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
