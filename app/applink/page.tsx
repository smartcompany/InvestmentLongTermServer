import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  detectPlatformFromUa,
  IOS_APP_STORE_WEB,
  PLAY_STORE_WEB,
} from "@/lib/applink";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Time Capital - Download",
  description: "Redirects to App Store or Google Play by device.",
  robots: { index: false, follow: false },
};

export default async function AppLinkPage() {
  const headerStore = await headers();
  const userAgent = headerStore.get("user-agent") ?? "";
  const platform = detectPlatformFromUa(userAgent);

  if (platform === "android") {
    redirect(PLAY_STORE_WEB);
  }
  if (platform === "ios" && IOS_APP_STORE_WEB) {
    redirect(IOS_APP_STORE_WEB);
  }

  redirect("/applink/social");
}
