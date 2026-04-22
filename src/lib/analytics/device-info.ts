/**
 * Minimal UA sniffing for analytics.
 *
 * UA parsing is never perfectly accurate, but the buckets are coarse on
 * purpose: we just want to be able to say "46% used a laptop, 38% used
 * an iPad, 16% used a phone" in the pilot report. We avoid adding a full
 * UA-parsing dependency for that.
 */

export type DeviceType = "desktop" | "tablet" | "mobile" | "unknown";

export interface AnalyticsDeviceInfo {
  deviceType: DeviceType;
  browser: string;
  os: string;
}

function detectBrowser(ua: string): string {
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\//.test(ua) || /Opera/.test(ua)) return "Opera";
  if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua) && !/Chrome/.test(ua) && !/Chromium/.test(ua)) return "Safari";
  if (/SamsungBrowser/.test(ua)) return "SamsungInternet";
  return "Other";
}

function detectOs(ua: string): string {
  if (/Windows NT/.test(ua)) return "Windows";
  if (/Mac OS X/.test(ua) && !/Mobile/.test(ua)) return "macOS";
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Android/.test(ua)) return "Android";
  if (/iPhone|iPod/.test(ua)) return "iOS";
  if (/iPad/.test(ua)) return "iPadOS";
  if (/Linux/.test(ua)) return "Linux";
  return "Other";
}

function detectDeviceType(ua: string): DeviceType {
  if (/iPad/.test(ua)) return "tablet";
  if (/Android/.test(ua) && !/Mobile/.test(ua)) return "tablet";
  if (/Mobile|iPhone|iPod|Android/.test(ua)) return "mobile";
  if (typeof window !== "undefined") {
    // iPadOS >=13 reports itself as macOS but has touch + narrowish width.
    if (
      /Macintosh/.test(ua) &&
      typeof navigator !== "undefined" &&
      navigator.maxTouchPoints > 1
    ) {
      return "tablet";
    }
  }
  if (/Macintosh|Windows NT|CrOS|Linux/.test(ua)) return "desktop";
  return "unknown";
}

export function getAnalyticsDeviceInfo(): AnalyticsDeviceInfo {
  if (typeof navigator === "undefined") {
    return { deviceType: "unknown", browser: "Unknown", os: "Unknown" };
  }
  const ua = navigator.userAgent || "";
  return {
    deviceType: detectDeviceType(ua),
    browser: detectBrowser(ua),
    os: detectOs(ua),
  };
}
