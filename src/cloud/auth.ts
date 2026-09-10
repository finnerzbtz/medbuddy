import { registerPlugin } from '@capacitor/core';
import { isNative } from '@/native/platform';
import { cloudConfig } from './config';
export interface CloudUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
}
interface AuthReply {
  status: number;
  body: unknown;
  jwt?: string;
}
const nativeAuth = registerPlugin<{
  request(options: {
    baseUrl: string;
    path: string;
    method: string;
    body?: string;
  }): Promise<AuthReply>;
  clear(options: { baseUrl: string }): Promise<void>;
}>('ReminduhAuth');
export class SignInRequired extends Error {}
export class CloudUnavailable extends Error {}
export async function authRequest(path: string, body?: object): Promise<AuthReply> {
  if (!cloudConfig.enabled)
    throw new CloudUnavailable('Cloud accounts are not configured in this build.');
  try {
    if (isNative)
      return await nativeAuth.request({
        baseUrl: cloudConfig.authUrl,
        path,
        method: body ? 'POST' : 'GET',
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    const response = await fetch(cloudConfig.authUrl + path, {
      method: body ? 'POST' : 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    });
    return {
      status: response.status,
      body: await response.json().catch(() => null),
      jwt: response.headers.get('set-auth-jwt') ?? undefined,
    };
  } catch {
    throw new CloudUnavailable(
      'Couldn’t connect. Your device data is safe. Try again when you’re online.',
    );
  }
}
function authFailure(reply: AuthReply): never {
  if (reply.status === 429)
    throw new Error('Too many attempts. Please wait a little before trying again.');
  throw new Error('That code could not be checked. Try again or request a new code.');
}
export async function sendSignInCode(email: string): Promise<void> {
  const reply = await authRequest('/email-otp/send-verification-otp', { email, type: 'sign-in' });
  if (reply.status >= 400) authFailure(reply);
}
export async function getCloudSession(): Promise<{ user: CloudUser; jwt: string } | null> {
  const reply = await authRequest('/get-session');
  if (reply.status >= 500)
    throw new CloudUnavailable('Cloud sync is temporarily unavailable. Your device data is safe.');
  if (reply.status >= 400 || !reply.body) return null;
  const body = reply.body as { user?: CloudUser; session?: unknown };
  if (!body.user || !body.session) return null;
  if (!body.user.emailVerified)
    throw new SignInRequired('Verify your email with a code to continue.');
  let jwt = reply.jwt;
  if (!jwt) {
    const token = await authRequest('/token');
    jwt = (token.body as { token?: string } | null)?.token;
  }
  if (!jwt) throw new SignInRequired('Please sign in again to resume cloud sync.');
  return { user: body.user, jwt };
}
export async function verifySignInCode(email: string, otp: string) {
  const reply = await authRequest('/sign-in/email-otp', { email, otp });
  if (reply.status >= 400) authFailure(reply);
  const session = await getCloudSession();
  if (!session) throw new Error('Sign-in did not finish. Please try again.');
  return { ...session, confirmationToken: (reply.body as { token?: string })?.token ?? '' };
}
export async function endCloudSession(): Promise<void> {
  const result = await authRequest('/sign-out', {});
  if (result.status >= 400 && result.status !== 401)
    throw new Error('Sign-out could not finish. Please try again.');
  if (isNative) await nativeAuth.clear({ baseUrl: cloudConfig.authUrl });
}
export async function clearNativeSession(): Promise<void> {
  if (isNative) await nativeAuth.clear({ baseUrl: cloudConfig.authUrl });
}
export async function cloudRpc<T>(
  method: 'reminduh_read' | 'reminduh_save' | 'reminduh_delete_account',
  args: object,
  ownerId: string,
): Promise<T> {
  const session = await getCloudSession();
  if (!session || session.user.id !== ownerId)
    throw new SignInRequired('Please sign in to this account again to sync.');
  // Server-first rollout: never upload/read a v2 snapshot through an older, lossy API.
  if (method !== 'reminduh_delete_account') {
    let protocol: Response;
    try {
      protocol = await fetch(cloudConfig.dataUrl + '/rpc/reminduh_protocol', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.jwt },
        body: '{}',
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new CloudUnavailable(
        'Waiting for a connection. Your changes are saved on this device.',
      );
    }
    if (protocol.status === 401 || protocol.status === 403)
      throw new SignInRequired('Please sign in again to continue.');
    const versions = await protocol.json().catch(() => null);
    if (
      !protocol.ok ||
      !Number.isInteger(versions?.maxSchema) ||
      !Number.isInteger(versions?.minSchema) ||
      versions.maxSchema < 2 ||
      versions.minSchema > 2 ||
      versions?.monotonicSchema !== true
    )
      throw new Error(
        'This build needs the Release A cloud update before syncing. Your changes stay saved on this device.',
      );
  }
  let response: Response;
  try {
    response = await fetch(cloudConfig.dataUrl + '/rpc/' + method, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.jwt },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new CloudUnavailable('Waiting for a connection. Your changes are saved on this device.');
  }
  const data = await response.json().catch(() => null);
  if (response.status === 401 || response.status === 403)
    throw new SignInRequired('Please sign in again to continue.');
  if (!response.ok)
    throw new Error(
      (data?.code === 'PT409' &&
        data?.message === 'Update Reminduh to sync this data. Your device copy is safe.') ||
      data?.message === 'Enter a fresh email code before deleting your account.'
        ? data.message
        : 'Cloud sync could not finish. Your device data is safe. Please try again.',
    );
  return data as T;
}
