"use client";

import type { UserProfile } from "@/lib/auth/types";

let profileCache: UserProfile | null = null;
let profilePromise: Promise<UserProfile | null> | null = null;

export async function getCurrentProfileClient(): Promise<UserProfile | null> {
  if (profileCache) return profileCache;
  if (profilePromise) return profilePromise;

  profilePromise = fetch("/api/auth/me", { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) return null;
      const data = (await response.json()) as { profile: UserProfile | null };
      profileCache = data.profile ?? null;
      return profileCache;
    })
    .catch(() => null)
    .finally(() => {
      profilePromise = null;
    });

  return profilePromise;
}

export function clearCurrentProfileCache() {
  profileCache = null;
}

