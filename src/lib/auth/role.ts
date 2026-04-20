import type { User } from "@supabase/supabase-js";
import type { AppRole } from "@/lib/auth/types";

const VALID_ROLES: AppRole[] = ["student", "teacher", "admin"];

export function parseRole(value: unknown): AppRole | null {
  if (typeof value !== "string") return null;
  return VALID_ROLES.includes(value as AppRole) ? (value as AppRole) : null;
}

export function resolveProfileRole(profileRole: unknown): AppRole | null {
  return parseRole(profileRole);
}

export function resolveMetadataRole(
  user: Pick<User, "app_metadata" | "user_metadata">,
): AppRole | null {
  return parseRole(user.user_metadata?.role) ?? parseRole(user.app_metadata?.role);
}

export function resolveRole(
  profileRole: unknown,
  user: Pick<User, "app_metadata" | "user_metadata">,
): AppRole | null {
  return resolveProfileRole(profileRole) ?? resolveMetadataRole(user);
}
