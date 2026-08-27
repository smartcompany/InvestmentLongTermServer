import {
  App,
  cert,
  getApps,
  initializeApp,
  ServiceAccount,
} from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

let _app: App | null = null;

function getApp(): App {
  if (_app) return _app;
  if (getApps().length > 0) {
    _app = getApps()[0]!;
    return _app;
  }

  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is required for FCM');
  }

  const credentials = JSON.parse(json) as ServiceAccount;
  _app = initializeApp({
    credential: cert(credentials),
  });
  return _app;
}

export async function sendFcmToToken(params: {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<boolean> {
  try {
    const messaging = getMessaging(getApp());
    await messaging.send({
      token: params.token,
      notification: {
        title: params.title,
        body: params.body,
      },
      data: params.data,
      apns: {
        payload: {
          aps: {
            sound: 'default',
          },
        },
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'portfolio_changes',
        },
      },
    });
    return true;
  } catch (e) {
    console.error('[FCM] send failed:', e);
    return false;
  }
}
