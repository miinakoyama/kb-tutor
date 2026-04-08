"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  FlaskConical,
  Home,
  BarChart3,
  Settings,
  Database,
  Menu,
  X,
  Bell,
  ClipboardList,
  Bookmark,
  NotebookPen,
  School,
} from "lucide-react";
import { getBookmarkedIds } from "@/lib/storage";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/notifications", label: "Notification", icon: Bell },
  { href: "/assignments", label: "My Assignment", icon: ClipboardList },
  { href: "/self-practice", label: "Self Practice", icon: NotebookPen },
  { href: "/progress", label: "My Progress", icon: BarChart3 },
  { href: "/bookmarks", label: "Bookmarks", icon: Bookmark },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/content", label: "Content Management", icon: Database },
  { href: "/teacher-dashboard", label: "Teacher Dashboard", icon: School },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [bookmarkCount, setBookmarkCount] = useState(0);

  useEffect(() => {
    const updateCount = () => setBookmarkCount(getBookmarkedIds().length);
    updateCount();
    window.addEventListener("storage", updateCount);
    const interval = setInterval(updateCount, 1000);
    return () => {
      window.removeEventListener("storage", updateCount);
      clearInterval(interval);
    };
  }, []);

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
          const isBookmarks = href === "/bookmarks";
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-lg font-medium transition-all ${
                active
                  ? "bg-white/20 text-white shadow-inner"
                  : "text-white/90 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {label}
              {isBookmarks && bookmarkCount > 0 && (
                <span className="ml-auto bg-white/20 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                  {bookmarkCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </>
  );

  return (
    <>
      {/* Mobile / tablet top header bar */}
      <header
        className="lg:hidden fixed top-0 left-0 right-0 h-16 z-40 flex items-center px-4 shadow-sm"
        style={{ background: "linear-gradient(135deg, #166534 0%, #15803d 100%)" }}
      >
        <button
          onClick={() => setIsOpen(true)}
          className="p-3 rounded-lg text-white min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-white/10 transition-colors"
          aria-label="Open menu"
        >
          <Menu className="w-6 h-6" />
        </button>
        <div className="flex-1 flex items-center justify-center gap-2">
          <FlaskConical className="w-5 h-5 text-white flex-shrink-0" />
          <span className="font-bold text-white text-base">CTAG KB Tutor</span>
        </div>
        {/* Spacer balances the hamburger so the title stays centered */}
        <div className="w-[44px]" aria-hidden />
      </header>

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
                  className="p-3 rounded-lg text-white hover:bg-white/10 min-w-[44px] min-h-[44px] flex items-center justify-center"
                  aria-label="Close menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
                {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                  const active = isActive(href);
                  const isBookmarks = href === "/bookmarks";
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setIsOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-lg font-medium transition-all ${
                        active
                          ? "bg-white/20 text-white shadow-inner"
                          : "text-white/90 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      <Icon className="w-5 h-5 flex-shrink-0" />
                      {label}
                      {isBookmarks && bookmarkCount > 0 && (
                        <span className="ml-auto bg-white/20 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                          {bookmarkCount}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </nav>
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
