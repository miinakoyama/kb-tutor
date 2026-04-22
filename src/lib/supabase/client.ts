"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";

let client: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowserClient() {
  if (!client) {
    client = createBrowserClient(getSupabaseUrl(), getSupabaseAnonKey());
  }
  return client;
}

/**
 * Discard the cached singleton so the next call rebuilds it. Used by the
 * sync queue when the browser transitions `offline -> online`: the in-memory
 * auth state inside supabase-js can get wedged by failed refresh attempts
 * that happened while the network was down, and the only thing that reliably
 * clears it (previously requiring a full page reload) is recreating the
 * client with fresh cookies.
 */
export function resetSupabaseBrowserClient(): void {
  client = null;
}

