"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  FlaskConical,
  LayoutDashboard,
  BarChart3,
  Settings,
  User,
  Menu,
  X,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/progress", label: "My Progress", icon: BarChart3 },
  { href: "/content", label: "Content Management", icon: Settings },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const sidebarContent = (
    <>
      <div className="flex items-center gap-2 px-4 py-4 border-b border-white/10">
        <FlaskConical className="w-7 h-7 text-bright flex-shrink-0" />
        <span className="font-bold text-white text-lg">CTAG KB Tutor</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-all ${
                active
                  ? "bg-white/20 text-white shadow-inner"
                  : "text-white/90 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-white/10 space-y-4">
        <div className="rounded-lg bg-white/10 p-3">
          <p className="text-xs font-medium text-white/80 uppercase tracking-wide">
            Current Goal
          </p>
          <p className="text-sm text-white font-medium mt-1">Keystone Exam</p>
          <p className="text-xs text-white/70 mt-0.5">Keep practicing!</p>
          <div className="mt-2 h-1.5 rounded-full bg-white/20 overflow-hidden">
            <div
              className="h-full rounded-full bg-bright transition-all"
              style={{ width: "45%" }}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10">
          <User className="w-4 h-4 text-bright" />
          <span className="text-sm text-white/90">LTI Login (Coming soon)</span>
        </div>
      </div>
    </>
  );

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg text-white shadow-lg"
        style={{ background: "#166534" }}
        aria-label="Open menu"
      >
        <Menu className="w-6 h-6" />
      </button>

      <div
        className={`fixed inset-0 bg-black/40 z-40 lg:hidden ${
          isOpen ? "block" : "hidden"
        }`}
        onClick={() => setIsOpen(false)}
        aria-hidden
      />

      <AnimatePresence>
        {isOpen && (
          <motion.aside
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed left-0 top-0 bottom-0 w-64 z-50 lg:hidden shadow-xl"
            style={{ background: "linear-gradient(135deg, #166534 0%, #15803d 100%)" }}
          >
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <FlaskConical className="w-7 h-7 text-bright" />
                  <span className="font-bold text-white text-lg">
                    CTAG KB Tutor
                  </span>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 rounded-lg text-white hover:bg-white/10"
                  aria-label="Close menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
                {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                  const active = isActive(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setIsOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-all ${
                        active
                          ? "bg-white/20 text-white shadow-inner"
                          : "text-white/90 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      <Icon className="w-5 h-5 flex-shrink-0" />
                      {label}
                    </Link>
                  );
                })}
              </nav>
              <div className="px-4 py-4 border-t border-white/10 space-y-4">
                <div className="rounded-lg bg-white/10 p-3">
                  <p className="text-xs font-medium text-white/80 uppercase tracking-wide">
                    Current Goal
                  </p>
                  <p className="text-sm text-white font-medium mt-1">
                    Keystone Exam
                  </p>
                  <div className="mt-2 h-1.5 rounded-full bg-white/20 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-bright"
                      style={{ width: "45%" }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10">
                  <User className="w-4 h-4 text-bright" />
                  <span className="text-sm text-white/90">
                    LTI Login (Coming soon)
                  </span>
                </div>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <aside
        className="hidden lg:flex lg:flex-col lg:fixed lg:left-0 lg:top-0 lg:bottom-0 lg:w-64 lg:z-30 lg:shadow-xl"
        style={{ background: "linear-gradient(135deg, #166534 0%, #15803d 100%)" }}
      >
        <div className="flex flex-col h-full w-full">{sidebarContent}</div>
      </aside>
    </>
  );
}
