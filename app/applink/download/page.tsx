import type { Metadata } from "next";
import { IOS_APP_STORE_WEB, PLAY_STORE_WEB } from "@/lib/applink";

// Mirrors the coinpang.org/timeCapital download page: client-side UA detection
// so in-app browsers and crawlers still get a visible fallback page.
const REDIRECT_SCRIPT = `
(function () {
  var ua = navigator.userAgent.toLowerCase();
  if (ua.indexOf('android') > -1) {
    window.location.href = ${JSON.stringify(PLAY_STORE_WEB)};
  } else if (
    ua.indexOf('iphone') > -1 ||
    ua.indexOf('ipad') > -1 ||
    ua.indexOf('ipod') > -1 ||
    ua.indexOf('macintosh') > -1
  ) {
    window.location.href = ${JSON.stringify(IOS_APP_STORE_WEB)};
  } else {
    window.location.href = ${JSON.stringify(IOS_APP_STORE_WEB)};
  }
})();
`.trim();

export const metadata: Metadata = {
  title: "앱 다운로드 안내",
  description: "앱 다운로드 안내",
  robots: { index: false, follow: false },
};

export default function AppLinkDownloadPage() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: REDIRECT_SCRIPT }} />
      <div style={{ textAlign: "center", marginTop: "40vh" }}>
        <h1>앱 다운로드로 이동 중...</h1>
        <p>잠시만 기다려주세요.</p>
      </div>
    </>
  );
}
