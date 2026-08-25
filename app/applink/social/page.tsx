import type { Metadata } from "next";
import {
  IOS_APP_STORE_ITMS,
  IOS_APP_STORE_WEB,
  PLAY_STORE_MARKET,
  PLAY_STORE_WEB,
} from "@/lib/applink";

const BOOT_SCRIPT = `
(function () {
  var ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  var inApp = /(Twitter|X\\/[\\d.]+|FBIOS|FBAN|FBAV|Line\\/|KakaoTalk|Kakao|Daum|KAKAOTALK|Whatsapp|Telegram|Snapchat|Slack|LinkedIn|FB_IAB|Instagram|Pinterest|musical_ly|ByteDance|Aweme|; wv\\))/i.test(ua);
  var isAndroid = /android/i.test(ua);
  var isIOS = /iphone|ipad|ipod/i.test(ua);
  var elIos = document.getElementById("applink-btn-ios");
  var elAnd = document.getElementById("applink-btn-android");
  if (isIOS && elIos && ${JSON.stringify(Boolean(IOS_APP_STORE_ITMS))}) { elIos.setAttribute("href", ${JSON.stringify(IOS_APP_STORE_ITMS)}); }
  if (isAndroid && elAnd) { elAnd.setAttribute("href", ${JSON.stringify(PLAY_STORE_MARKET)}); }
  if (inApp) { return; }
  if (!isAndroid && !isIOS) { return; }
  var scheme = isAndroid ? ${JSON.stringify(PLAY_STORE_MARKET)} : ${JSON.stringify(IOS_APP_STORE_ITMS ?? "")};
  var web = isAndroid ? ${JSON.stringify(PLAY_STORE_WEB)} : ${JSON.stringify(IOS_APP_STORE_WEB ?? "")};
  if (!isAndroid && !web) { return; }
  var t = window.setTimeout(function () { window.location.replace(web); }, 2000);
  function cancel() {
    if (t !== null) { window.clearTimeout(t); t = null; }
  }
  document.addEventListener("visibilitychange", function () { if (document.hidden) { cancel(); } });
  window.addEventListener("pagehide", cancel);
  try {
    if (scheme) { window.location.href = scheme; }
    else { cancel(); window.location.replace(web); }
  } catch (e) { cancel(); window.location.replace(web); }
})();
`.trim();

export const metadata: Metadata = {
  title: "My Assets AI - Download",
  description: "Choose App Store or Google Play to install My Assets AI.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "My Assets AI",
    description: "Long-term investment simulator for crypto, stocks, and real estate.",
    url: "https://investment-long-term-server.vercel.app/applink/social",
  },
  twitter: {
    card: "summary",
    title: "My Assets AI",
    description: "Long-term investment simulator for crypto, stocks, and real estate.",
  },
};

export default function AppLinkSocialPage() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      <main
        style={{
          boxSizing: "border-box",
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: "8px",
          background: "#05080c",
          color: "#f4f4f5",
          padding: "max(1.5rem, env(safe-area-inset-top)) 24px max(5rem, env(safe-area-inset-bottom, 32px))",
          textAlign: "center",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <p style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>My Assets AI</p>
        <p
          style={{
            margin: "8px 0 0",
            maxWidth: 360,
            fontSize: 12,
            lineHeight: 1.5,
            color: "#a1a1aa",
          }}
        >
          In-app browsers (X, Kakao, Instagram) may block auto redirect. Please tap one of
          the buttons below.
        </p>
        <div
          style={{
            marginTop: 16,
            width: "100%",
            maxWidth: 360,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <a
            id="applink-btn-ios"
            href={IOS_APP_STORE_WEB ?? "#"}
            style={{
              display: "block",
              borderRadius: 12,
              background: IOS_APP_STORE_WEB ? "#ffffff" : "rgba(255,255,255,0.1)",
              color: IOS_APP_STORE_WEB ? "#18181b" : "#a1a1aa",
              textDecoration: "none",
              padding: "14px 20px",
              fontSize: 14,
              fontWeight: 700,
              pointerEvents: IOS_APP_STORE_WEB ? "auto" : "none",
              opacity: IOS_APP_STORE_WEB ? 1 : 0.7,
            }}
          >
            {IOS_APP_STORE_WEB ? "App Store" : "App Store (coming soon)"}
          </a>
          <a
            id="applink-btn-android"
            href={PLAY_STORE_WEB}
            style={{
              display: "block",
              borderRadius: 12,
              border: "1px solid #52525b",
              background: "rgba(255,255,255,0.06)",
              color: "#f4f4f5",
              textDecoration: "none",
              padding: "14px 20px",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            Google Play
          </a>
        </div>
      </main>
    </>
  );
}
