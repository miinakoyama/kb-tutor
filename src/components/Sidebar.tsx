"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  FlaskConical,
  Home,
  BarChart3,
  Database,
  Menu,
  X,
  ClipboardList,
  Bookmark,
  NotebookPen,
  School,
  StickyNote,
  Users,
  LayoutDashboard,
  Settings,
  LogOut,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { fetchBookmarkIds, getBookmarkedIds } from "@/lib/storage";
import { FirstLoginOnboarding } from "@/components/FirstLoginOnboarding";
import {
  markOnboardingCompleted,
  ONBOARDING_REPLAY_EVENT,
  syncOnboardingCompletion,
} from "@/lib/onboarding-settings";
import { getTourTargetIdForHref, TOUR_TARGET_IDS } from "@/lib/onboarding-tour";

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
    { href: "/assignments", label: "My Assignment", icon: ClipboardList },
    { href: "/self-practice", label: "Self Practice", icon: NotebookPen },
    { href: "/progress", label: "My Progress", icon: BarChart3 },
    { href: "/bookmarks", label: "Bookmarks", icon: Bookmark },
    { href: "/my-notes", label: "My Notes", icon: StickyNote },
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

const SIDEBAR_MOTION =
  "duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]";
const SIDEBAR_TEXT_MOTION =
  "transition-[opacity,max-width,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]";

const ADMIN_SECTION: NavSection = {
  title: "Admin Console",
  items: [
    { href: "/content/accounts", label: "Accounts", icon: Users },
    { href: "/content/schools", label: "Schools", icon: School },
    { href: "/content/data-analysis", label: "Data Analysis", icon: BarChart3 },
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
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [bookmarkCount, setBookmarkCount] = useState(0);
  const [role, setRole] = useState<AppRole>("student");
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [userProfile, setUserProfile] = useState<{ display_name: string | null; student_id: string | null; email: string } | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingRunId, setOnboardingRunId] = useState(0);
  // Separate refs for mobile drawer vs desktop sidebar. Both instances of the
  // user menu may be mounted at once (the desktop aside is hidden via CSS on
  // mobile widths but still in the DOM), so a single shared ref would point
  // at the wrong element and the outside-click handler would misfire.
  const desktopUserMenuRef = useRef<HTMLDivElement>(null);
  const mobileUserMenuRef = useRef<HTMLDivElement>(null);

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
            id?: string;
            email?: string | null;
            user_metadata?: { role?: string; student_id?: string; display_name?: string };
            app_metadata?: { role?: string };
          } | null;
          profile?: { id?: string; role?: AppRole; display_name?: string | null; student_id?: string | null; email?: string } | null;
        };

        setUserId(payload.profile?.id ?? payload.user?.id ?? null);

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
      const target = e.target as Node;
      const inDesktop = desktopUserMenuRef.current?.contains(target) ?? false;
      const inMobile = mobileUserMenuRef.current?.contains(target) ?? false;
      if (!inDesktop && !inMobile) {
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
    // DB is the source of truth; we seed the badge from Supabase on mount
    // (catches changes made on other devices). After that we read the
    // localStorage cache cheaply at 1Hz — every add/removeBookmark writes
    // through to that cache synchronously, so same-tab updates are picked
    // up without additional network round-trips.
    const updateCount = () => setBookmarkCount(getBookmarkedIds().length);
    const load = async () => {
      const ids = await fetchBookmarkIds();
      setBookmarkCount(ids.length);
    };
    void load();
    window.addEventListener("storage", updateCount);
    const interval = setInterval(updateCount, 1000);
    return () => {
      window.removeEventListener("storage", updateCount);
      clearInterval(interval);
    };
  }, [hasBookmarks]);

  useEffect(() => {
    if (!roleLoaded) return;
    if (role === "admin") {
      setShowOnboarding(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      const completed = await syncOnboardingCompletion(userId ?? undefined);
      if (!cancelled) {
        setShowOnboarding(!completed);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [roleLoaded, role, userId]);

  useEffect(() => {
    const handleReplay = () => {
      if (!roleLoaded || role === "admin") return;
      setShowOnboarding(true);
      setOnboardingRunId((prev) => prev + 1);
    };

    window.addEventListener(ONBOARDING_REPLAY_EVENT, handleReplay);
    return () => window.removeEventListener(ONBOARDING_REPLAY_EVENT, handleReplay);
  }, [roleLoaded, role]);

  const handleCompleteOnboarding = () => {
    setShowOnboarding(false);
    void markOnboardingCompleted(userId ?? undefined);

    if (role === "teacher") {
      router.push("/teacher-dashboard");
      return;
    }
    router.push("/");
  };

  const handleSkipOnboarding = () => {
    setShowOnboarding(false);
    void markOnboardingCompleted(userId ?? undefined);
  };

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

  const renderNavItems = (
    items: NavItem[],
    collapsed: boolean,
    closeMobileMenu = false,
  ) =>
    items.map(({ href, label, icon: Icon }) => {
      const active = isActive(href);
      const isBookmarksLink = href === "/bookmarks";
      const tourTargetId = getTourTargetIdForHref(href, role);
      return (
        <Link
          key={href}
          href={href}
          data-tour-id={tourTargetId}
          title={collapsed ? label : undefined}
          onClick={closeMobileMenu ? () => setIsOpen(false) : undefined}
          className={`flex items-center overflow-hidden rounded-lg font-medium text-base transition-[background-color,color,padding,gap] ${SIDEBAR_MOTION} ${
            collapsed ? "justify-center gap-0 p-3" : "justify-start gap-3 px-3.5 py-3"
          } ${
            active
              ? "bg-surface/20 text-white shadow-inner"
              : "text-white/90 hover:bg-surface/10 hover:text-white"
          }`}
        >
          <Icon className="w-5 h-5 flex-shrink-0" />
          <span
            className={`min-w-0 truncate whitespace-nowrap ${SIDEBAR_TEXT_MOTION} ${
              collapsed
                ? "max-w-0 -translate-x-1 opacity-0"
                : "max-w-[160px] translate-x-0 opacity-100"
            }`}
          >
            {label}
          </span>
          {isBookmarksLink && bookmarkCount > 0 && (
            <span
              className={`ml-auto bg-surface/20 text-white text-xs font-semibold px-2 py-0.5 rounded-full ${SIDEBAR_TEXT_MOTION} ${
                collapsed
                  ? "max-w-0 -translate-x-1 opacity-0"
                  : "max-w-[48px] translate-x-0 opacity-100"
              }`}
            >
              {bookmarkCount}
            </span>
          )}
        </Link>
      );
    });

  const renderSections = (collapsed: boolean, closeMobileMenu = false) => {
    if (!roleLoaded) return null;
    return navSections.map((section, index) => (
      <div key={section.title ?? `section-${index}`} className={index > 0 ? "mt-5 pt-5 border-t border-white/10" : ""}>
        {section.title && (
          <p
            className={`overflow-hidden px-3 text-xs font-semibold uppercase tracking-wider text-white/50 transition-[opacity,max-height,margin] ${SIDEBAR_MOTION} ${
              collapsed ? "mb-0 max-h-0 opacity-0" : "mb-2 max-h-5 opacity-100"
            }`}
          >
            {section.title}
          </p>
        )}
        <div className="space-y-[5px]">{renderNavItems(section.items, collapsed, closeMobileMenu)}</div>
      </div>
    ));
  };

  const renderUserMenuPopup = (collapsed: boolean, closeMobileMenu = false) => (
    <AnimatePresence>
      {showUserMenu && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.15 }}
          className={`absolute bg-surface rounded-xl shadow-xl border border-border-subtle overflow-hidden z-50 ${
            collapsed
              ? "bottom-0 left-full ml-2 w-56"
              : "bottom-full left-0 right-0 mb-2 mx-3"
          }`}
        >
          {userProfile && (
            <div className="px-4 py-3 border-b border-border-subtle">
              <p className="text-xs text-muted-foreground mb-0.5">Signed in as</p>
              <p className="text-sm font-semibold text-foreground truncate">
                {getDisplayName(userProfile)}
              </p>
              {role !== "student" && (
                <p className="text-xs text-muted-foreground truncate">{userProfile.email}</p>
              )}
            </div>
          )}
          <Link
            href="/settings"
            onClick={() => {
              setShowUserMenu(false);
              if (closeMobileMenu) setIsOpen(false);
            }}
            className="flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-surface-muted transition-colors"
          >
            <Settings className="w-4 h-4 text-muted-foreground" />
            Settings
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-error hover:bg-error-light transition-colors border-t border-border-subtle"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );

  const renderUserButton = (collapsed: boolean, closeMobileMenu = false) => (
    <div
      ref={closeMobileMenu ? mobileUserMenuRef : desktopUserMenuRef}
      className="relative border-t border-white/10 p-3.5"
    >
      {renderUserMenuPopup(collapsed, closeMobileMenu)}
      <button
        onClick={() => setShowUserMenu((v) => !v)}
        title={collapsed && userProfile ? getDisplayName(userProfile) : undefined}
        className={`w-full flex items-center overflow-hidden rounded-lg hover:bg-surface/10 transition-[background-color,padding,gap] ${SIDEBAR_MOTION} group ${
          collapsed ? "justify-center gap-0 p-2.5" : "justify-start gap-3 px-3.5 py-2.5"
        }`}
      >
        <div className="w-8 h-8 rounded-full bg-surface/20 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          {userProfile ? getInitial(userProfile) : "?"}
        </div>
        <div
          className={`min-w-0 flex-1 text-left ${SIDEBAR_TEXT_MOTION} ${
            collapsed
              ? "max-w-0 -translate-x-1 opacity-0"
              : "max-w-[148px] translate-x-0 opacity-100"
          }`}
        >
          <p className="text-sm font-medium text-white truncate">
            {userProfile ? getDisplayName(userProfile) : "Loading..."}
          </p>
          <p className="text-xs text-white/60 capitalize">{role}</p>
        </div>
        <ChevronUp
          className={`w-4 h-4 flex-shrink-0 text-white/60 transition-[opacity,transform] duration-200 ${
            showUserMenu ? "rotate-180" : ""
          } ${collapsed ? "opacity-0" : "opacity-100"}`}
        />
      </button>
    </div>
  );

  const desktopSidebarContent = (
    <>
      <div className={`flex items-center border-b border-white/10 transition-[padding,gap] ${SIDEBAR_MOTION} ${
        isCollapsed ? "justify-center gap-0 p-3.5" : "justify-start gap-2.5 px-5 py-5"
      }`}>
        <div
          className={`flex min-w-0 items-center gap-2.5 overflow-hidden ${SIDEBAR_TEXT_MOTION} ${
            isCollapsed
              ? "max-w-0 -translate-x-1 opacity-0"
              : "max-w-[190px] translate-x-0 opacity-100"
          }`}
        >
          <FlaskConical className="w-7 h-7 text-bright flex-shrink-0" />
          <span className="truncate font-bold text-white text-lg">CTAG KB Tutor</span>
        </div>
        <button
          data-tour-id={TOUR_TARGET_IDS.SIDEBAR_TOGGLE}
          onClick={onToggle}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-surface/10 transition-colors flex-shrink-0 ${
            isCollapsed ? "" : "ml-0.5"
          }`}
        >
          {isCollapsed
            ? <ChevronRight className="w-5 h-5" />
            : <ChevronLeft className="w-5 h-5" />
          }
        </button>
      </div>

      <nav className={`flex-1 py-5 overflow-y-auto transition-[padding] ${SIDEBAR_MOTION} ${isCollapsed ? "px-2.5" : "px-3.5"}`}>
        {renderSections(isCollapsed, false)}
      </nav>

      {renderUserButton(isCollapsed)}
    </>
  );

  return (
    <>
      {/* Mobile / tablet top header bar */}
      <header
        className="lg:hidden fixed top-0 left-0 right-0 h-16 z-40 flex items-center px-4 shadow-sm"
        style={{ background: "var(--sidebar-gradient)" }}
      >
        <button
          onClick={() => setIsOpen(true)}
          className="p-3 rounded-lg text-white min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-surface/10 transition-colors"
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
            data-tour-id={TOUR_TARGET_IDS.SIDEBAR_ROOT}
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed left-0 top-0 bottom-0 w-64 z-50 lg:hidden shadow-xl"
            style={{ background: "var(--sidebar-gradient)" }}
          >
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between px-5 py-5 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <FlaskConical className="w-7 h-7 text-bright" />
                  <span className="font-bold text-white text-lg">
                    CTAG KB Tutor
                  </span>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-3 rounded-lg text-white hover:bg-surface/10 min-w-[44px] min-h-[44px] flex items-center justify-center"
                  aria-label="Close menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="flex-1 px-3.5 py-5 overflow-y-auto">{renderSections(false, true)}</nav>
              {renderUserButton(false, true)}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <aside
        data-tour-id={TOUR_TARGET_IDS.SIDEBAR_ROOT}
        className={`hidden lg:flex lg:flex-col lg:fixed lg:left-0 lg:top-0 lg:bottom-0 lg:z-30 lg:shadow-xl overflow-hidden transition-[width] ${SIDEBAR_MOTION} ${
          isCollapsed ? "lg:w-14" : "lg:w-64"
        }`}
        style={{ background: "var(--sidebar-gradient)" }}
      >
        <div className="flex flex-col h-full w-full">{desktopSidebarContent}</div>
      </aside>

      {showOnboarding && (
        <FirstLoginOnboarding
          key={onboardingRunId}
          role={role === "teacher" ? "teacher" : "student"}
          onComplete={handleCompleteOnboarding}
          onSkip={handleSkipOnboarding}
        />
      )}
    </>
  );
}
