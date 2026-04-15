"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  FlaskConical,
  Home,
  BarChart3,
  Database,
  Menu,
  X,
  Bell,
  ClipboardList,
  Bookmark,
  NotebookPen,
  School,
  Users,
  LayoutDashboard,
  Settings,
  LogOut,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { getBookmarkedIds, syncBookmarksFromDb } from "@/lib/storage";

type AppRole = "student" | "teacher" | "admin";
const VALID_ROLES: AppRole[] = ["student", "teacher", "admin"];

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

const STUDENT_SECTION: NavSection = {
  title: "Learning",
  items: [
    { href: "/", label: "Home", icon: Home },
    { href: "/notifications", label: "Notifications", icon: Bell },
    { href: "/assignments", label: "My Assignment", icon: ClipboardList },
    { href: "/self-practice", label: "Self Practice", icon: NotebookPen },
    { href: "/progress", label: "My Progress", icon: BarChart3 },
    { href: "/bookmarks", label: "Bookmarks", icon: Bookmark },
  ],
};

const TEACHER_SECTION: NavSection = {
  title: "Teacher",
  items: [
    { href: "/teacher-dashboard", label: "Teacher Dashboard", icon: LayoutDashboard },
    { href: "/assignments/manage", label: "Assignments", icon: ClipboardList },
    { href: "/content", label: "Contents", icon: Database },
  ],
};

const ADMIN_SECTION: NavSection = {
  title: "Admin Console",
  items: [
    { href: "/content/accounts", label: "Accounts", icon: Users },
    { href: "/content/schools", label: "Schools", icon: School },
    { href: "/assignments/manage", label: "Assignments", icon: ClipboardList },
    { href: "/content", label: "Contents", icon: Database },
    { href: "/teacher-dashboard", label: "Teacher Dashboard", icon: LayoutDashboard },
  ],
};

function getNavSections(role: AppRole): NavSection[] {
  switch (role) {
    case "admin":
      return [ADMIN_SECTION];
    case "teacher":
      return [TEACHER_SECTION];
    default:
      return [{ ...STUDENT_SECTION, title: undefined }];
  }
}

function getInitial(profile: { display_name: string | null; student_id: string | null; email: string }): string {
  const name = profile.display_name || profile.student_id || profile.email;
  return name.charAt(0).toUpperCase();
}

function getDisplayName(profile: { display_name: string | null; student_id: string | null; email: string }): string {
  return profile.display_name || profile.student_id || profile.email;
}

export function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [bookmarkCount, setBookmarkCount] = useState(0);
  const [role, setRole] = useState<AppRole>("student");
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [userProfile, setUserProfile] = useState<{ display_name: string | null; student_id: string | null; email: string } | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const navSections = getNavSections(role);
  const hasBookmarks = navSections.some((section) =>
    section.items.some((item) => item.href === "/bookmarks")
  );

  useEffect(() => {
    const loadRole = async () => {
      try {
        const response = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error("Failed to load current user");
        }
        const payload = (await response.json()) as {
          user?: {
            email?: string | null;
            user_metadata?: { role?: string; student_id?: string; display_name?: string };
            app_metadata?: { role?: string };
          } | null;
          profile?: { role?: AppRole; display_name?: string | null; student_id?: string | null; email?: string } | null;
        };

        const inferredRole =
          payload.profile?.role ??
          (VALID_ROLES.includes((payload.user?.user_metadata?.role ?? "") as AppRole)
            ? (payload.user?.user_metadata?.role as AppRole)
            : VALID_ROLES.includes((payload.user?.app_metadata?.role ?? "") as AppRole)
              ? (payload.user?.app_metadata?.role as AppRole)
              : "student");
        setRole(inferredRole);

        const profileForUi =
          payload.profile
            ? {
                display_name: payload.profile.display_name ?? null,
                student_id: payload.profile.student_id ?? null,
                email: payload.profile.email ?? "",
              }
            : payload.user
              ? {
                  display_name: payload.user.user_metadata?.display_name ?? null,
                  student_id: payload.user.user_metadata?.student_id ?? null,
                  email: payload.user.email ?? "",
                }
              : null;

        setUserProfile(profileForUi);
      } catch {
        setRole("student");
        setUserProfile({
          display_name: "User",
          student_id: null,
          email: "",
        });
      } finally {
        setRoleLoaded(true);
      }
    };
    void loadRole();
  }, []);

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!hasBookmarks) {
      setBookmarkCount(0);
      return;
    }
    const updateCount = () => setBookmarkCount(getBookmarkedIds().length);
    const load = async () => {
      await syncBookmarksFromDb();
      updateCount();
    };
    void load();
    window.addEventListener("storage", updateCount);
    const interval = setInterval(updateCount, 1000);
    return () => {
      window.removeEventListener("storage", updateCount);
      clearInterval(interval);
    };
  }, [hasBookmarks]);

  const activeHref = useMemo(() => {
    const items = navSections.flatMap((section) => section.items);
    let bestMatch: string | null = null;

    for (const item of items) {
      const isMatch =
        pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (!isMatch) continue;
      if (!bestMatch || item.href.length > bestMatch.length) {
        bestMatch = item.href;
      }
    }

    return bestMatch;
  }, [navSections, pathname]);

  const isActive = (href: string) => activeHref === href;

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const renderNavItems = (items: NavItem[], closeMobileMenu = false) =>
    items.map(({ href, label, icon: Icon }) => {
      const active = isActive(href);
      const isBookmarksLink = href === "/bookmarks";
      return (
        <Link
          key={href}
          href={href}
          title={isCollapsed ? label : undefined}
          onClick={closeMobileMenu ? () => setIsOpen(false) : undefined}
          className={`flex items-center rounded-lg font-medium transition-all ${
            isCollapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5"
          } ${
            active
              ? "bg-white/20 text-white shadow-inner"
              : "text-white/90 hover:bg-white/10 hover:text-white"
          }`}
        >
          <Icon className="w-5 h-5 flex-shrink-0" />
          {!isCollapsed && label}
          {!isCollapsed && isBookmarksLink && bookmarkCount > 0 && (
            <span className="ml-auto bg-white/20 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
              {bookmarkCount}
            </span>
          )}
        </Link>
      );
    });

  const renderSections = (closeMobileMenu = false) =>
    navSections.map((section, index) => (
      <div key={section.title ?? `section-${index}`} className={index > 0 ? "mt-4 pt-4 border-t border-white/10" : ""}>
        {section.title && !isCollapsed && (
          <p className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-white/50">
            {section.title}
          </p>
        )}
        <div className="space-y-1">{renderNavItems(section.items, closeMobileMenu)}</div>
      </div>
    ));

  const userMenuPopup = (
    <AnimatePresence>
      {showUserMenu && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.15 }}
          className={`absolute bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-50 ${
            isCollapsed
              ? "bottom-0 left-full ml-2 w-56"
              : "bottom-full left-0 right-0 mb-2 mx-3"
          }`}
        >
          {userProfile && (
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="text-xs text-slate-400 mb-0.5">Signed in as</p>
              <p className="text-sm font-semibold text-slate-700 truncate">
                {getDisplayName(userProfile)}
              </p>
              <p className="text-xs text-slate-400 truncate">{userProfile.email}</p>
            </div>
          )}
          <Link
            href="/settings"
            onClick={() => setShowUserMenu(false)}
            className="flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Settings className="w-4 h-4 text-slate-400" />
            Settings
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors border-t border-slate-100"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );

  const userButton = (
    <div ref={userMenuRef} className="relative border-t border-white/10 p-3">
      {userMenuPopup}
      <button
        onClick={() => setShowUserMenu((v) => !v)}
        title={isCollapsed && userProfile ? getDisplayName(userProfile) : undefined}
        className={`w-full flex items-center rounded-lg hover:bg-white/10 transition-colors group ${
          isCollapsed ? "justify-center p-2" : "gap-3 px-3 py-2"
        }`}
      >
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          {userProfile ? getInitial(userProfile) : "?"}
        </div>
        {!isCollapsed && (
          <>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium text-white truncate">
                {userProfile ? getDisplayName(userProfile) : "Loading..."}
              </p>
              <p className="text-xs text-white/60 capitalize">{role}</p>
            </div>
            <ChevronUp
              className={`w-4 h-4 text-white/60 transition-transform ${showUserMenu ? "rotate-180" : ""}`}
            />
          </>
        )}
      </button>
    </div>
  );

  const sidebarContent = (
    <>
      <div className={`flex items-center border-b border-white/10 ${
        isCollapsed ? "justify-center p-3" : "gap-2 px-4 py-4"
      }`}>
        {!isCollapsed && <FlaskConical className="w-7 h-7 text-bright flex-shrink-0" />}
        {!isCollapsed && <span className="font-bold text-white text-lg">CTAG KB Tutor</span>}
        <button
          onClick={onToggle}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
        >
          {isCollapsed
            ? <ChevronRight className="w-5 h-5" />
            : <ChevronLeft className="w-5 h-5" />
          }
        </button>
      </div>

      <nav className={`flex-1 py-4 overflow-y-auto ${isCollapsed ? "px-2" : "px-3"}`}>
        {renderSections(false)}
      </nav>

      {userButton}
    </>
  );

  if (!roleLoaded) {
    return null;
  }

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
              <nav className="flex-1 px-3 py-4 overflow-y-auto">{renderSections(true)}</nav>
              {userButton}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <aside
        className={`hidden lg:flex lg:flex-col lg:fixed lg:left-0 lg:top-0 lg:bottom-0 lg:z-30 lg:shadow-xl overflow-hidden transition-all duration-300 ${
          isCollapsed ? "lg:w-14" : "lg:w-64"
        }`}
        style={{ background: "linear-gradient(135deg, #166534 0%, #15803d 100%)" }}
      >
        <div className="flex flex-col h-full w-full">{sidebarContent}</div>
      </aside>
    </>
  );
}
