export const IOS_APP_STORE_WEB =
  process.env.APP_LINK_IOS_URL ?? "https://apps.apple.com/app/id0000000000";

export const PLAY_STORE_WEB =
  process.env.APP_LINK_ANDROID_URL ??
  "https://play.google.com/store/apps/details?id=com.smartcompany.longterminvestment";

export const IOS_APP_STORE_ITMS = IOS_APP_STORE_WEB.replace(
  "https://apps.apple.com/",
  "itms-apps://apps.apple.com/"
);

export const PLAY_STORE_MARKET =
  process.env.APP_LINK_ANDROID_MARKET_URL ??
  "market://details?id=com.smartcompany.longterminvestment";

type Platform = "ios" | "android" | "other";

export function detectPlatformFromUa(userAgent: string): Platform {
  const ua = userAgent.toLowerCase();
  if (ua.includes("android")) {
    return "android";
  }
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) {
    return "ios";
  }
  return "other";
}
