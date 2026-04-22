import type { BrowserContext } from "@playwright/test";

type AppRole = "student" | "teacher" | "admin";

const ROLE_COOKIE_NAME = "kb_e2e_role";

function resolveBaseUrl(baseUrl: string | undefined): URL {
  return new URL(baseUrl ?? "http://127.0.0.1:3000");
}

export async function setRoleCookie(
  context: BrowserContext,
  baseUrl: string | undefined,
  role: AppRole,
): Promise<void> {
  const url = resolveBaseUrl(baseUrl);
  await context.addCookies([
    {
      name: ROLE_COOKIE_NAME,
      value: role,
      domain: url.hostname,
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}

export async function clearRoleCookie(
  context: BrowserContext,
  baseUrl: string | undefined,
): Promise<void> {
  const url = resolveBaseUrl(baseUrl);
  await context.addCookies([
    {
      name: ROLE_COOKIE_NAME,
      value: "",
      domain: url.hostname,
      path: "/",
      expires: 0,
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}
