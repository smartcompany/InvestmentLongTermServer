import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getMessaging, Messaging } from 'firebase-admin/messaging';
import { existsSync, readFileSync } from 'node:fs';
import { getSupabase } from '@/lib/supabase';

let firebaseApp: App | null = null;
let messaging: Messaging | null = null;

function loadServiceAccount(): Record<string, unknown> {
  const raw =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (!raw) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON (or FIREBASE_SERVICE_ACCOUNT_KEY) is required',
    );
  }

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    if (existsSync(raw)) {
      return JSON.parse(readFileSync(raw, 'utf8')) as Record<string, unknown>;
    }
    throw new Error(
      'Invalid Firebase service account. Must be JSON string or file path.',
    );
  }
}

function getApp(): App {
  if (firebaseApp) return firebaseApp;
  if (getApps().length > 0) {
    firebaseApp = getApps()[0]!;
    return firebaseApp;
  }
  firebaseApp = initializeApp({
    credential: cert(loadServiceAccount() as Parameters<typeof cert>[0]),
  });
  return firebaseApp;
}

function getMessagingInstance(): Messaging {
  if (!messaging) {
    messaging = getMessaging(getApp());
  }
  return messaging;
}

export type FcmSendStatus = 'sent' | 'invalid_token' | 'apns_auth' | 'failed';

function classifyFcmError(e: unknown): FcmSendStatus {
  const code =
    typeof e === 'object' && e !== null && 'code' in e
      ? String((e as { code: unknown }).code)
      : '';

  if (
    code.includes('invalid-registration-token') ||
    code.includes('registration-token-not-registered') ||
    code.includes('invalid-argument')
  ) {
    return 'invalid_token';
  }
  if (code.includes('third-party-auth-error')) {
    return 'apns_auth';
  }
  return 'failed';
}

async function clearInvalidFcmToken(anonymousId: string): Promise<void> {
  try {
    await getSupabase()
      .from('assetfit_anonymous_users')
      .update({
        fcm_token: null,
        updated_at: new Date().toISOString(),
      })
      .eq('anonymous_id', anonymousId);
  } catch (e) {
    console.error('[FCM] failed to clear invalid token:', anonymousId, e);
  }
}

/** LetsMeet messaging.ts 와 동일 패턴: Admin SDK + FCM token */
export async function sendFcmToToken(params: {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  anonymousId?: string;
}): Promise<FcmSendStatus> {
  const token = params.token.trim();
  if (!token || token.length < 80) {
    if (params.anonymousId) await clearInvalidFcmToken(params.anonymousId);
    return 'invalid_token';
  }

  try {
    await getMessagingInstance().send({
      token,
      notification: { title: params.title, body: params.body },
      data: params.data || {},
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default' } } },
    });
    return 'sent';
  } catch (e) {
    const status = classifyFcmError(e);
    console.error('[FCM] send failed:', status, e);
    if (status === 'invalid_token' && params.anonymousId) {
      await clearInvalidFcmToken(params.anonymousId);
    }
    return status;
  }
}

export async function sendPushToDevice(params: {
  fcmToken?: string | null;
  title: string;
  body: string;
  data?: Record<string, string>;
  anonymousId?: string;
}): Promise<FcmSendStatus> {
  const fcmToken = params.fcmToken?.trim() || '';
  if (!fcmToken) return 'failed';
  return sendFcmToToken({
    token: fcmToken,
    title: params.title,
    body: params.body,
    data: params.data,
    anonymousId: params.anonymousId,
  });
}
