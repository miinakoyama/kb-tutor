"use client";

import { useEffect, useState } from "react";

export interface AuthUserIdState {
  userId: string | null;
  /** True after `/api/auth/me` returns (use stable localStorage key). */
  resolved: boolean;
}

/**
 * Resolves the signed-in user's id for client-only UX flags (e.g. localStorage keys).
 */
export function useAuthUserId(): AuthUserIdState {
  const [state, setState] = useState<AuthUserIdState>({ userId: null, resolved: false });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "include",
        });
        if (!response.ok) {
          if (!cancelled) setState({ userId: null, resolved: true });
          return;
        }
        const payload = (await response.json()) as {
          profile?: { id?: string } | null;
          user?: { id?: string } | null;
        };
        const id = payload.profile?.id ?? payload.user?.id ?? null;
        if (!cancelled) setState({ userId: id, resolved: true });
      } catch {
        if (!cancelled) setState({ userId: null, resolved: true });
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
