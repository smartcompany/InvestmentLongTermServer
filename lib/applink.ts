const iosUrlFromEnv = process.env.APP_LINK_IOS_URL;
const hasValidIosUrl =
  typeof iosUrlFromEnv === "string" &&
  iosUrlFromEnv.startsWith("https://apps.apple.com/");

const DEFAULT_IOS_APP_STORE_WEB = "https://apps.apple.com/us/app/time-capital/id6755960389";

export const IOS_APP_STORE_WEB = hasValidIosUrl
  ? iosUrlFromEnv
  : DEFAULT_IOS_APP_STORE_WEB;

export const PLAY_STORE_WEB =
  process.env.APP_LINK_ANDROID_URL ??
  "https://play.google.com/store/apps/details?id=com.smartcompany.longterminvestment";

export const IOS_APP_STORE_ITMS = IOS_APP_STORE_WEB
  ? IOS_APP_STORE_WEB.replace("https://apps.apple.com/", "itms-apps://apps.apple.com/")
  : null;

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
