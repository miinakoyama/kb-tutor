import type { User } from "@supabase/supabase-js";
import type { AppRole } from "@/lib/auth/types";
import { resolveMetadataRole, resolveProfileRole } from "@/lib/auth/role";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function resolveRoleWithServerFallback(
  user: Pick<User, "id" | "app_metadata" | "user_metadata">,
  sessionProfileRole: unknown,
): Promise<AppRole | null> {
  const roleFromSessionProfile = resolveProfileRole(sessionProfileRole);
  if (roleFromSessionProfile) return roleFromSessionProfile;

  const admin = createSupabaseAdminClient();
  const { data: adminProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return resolveProfileRole(adminProfile?.role) ?? resolveMetadataRole(user);
}
