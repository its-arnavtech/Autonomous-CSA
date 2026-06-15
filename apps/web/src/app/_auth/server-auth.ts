import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuthCookieNames } from '../api/_utils/proxy';

export type SessionMembership = {
  organizationId: string;
  organizationSlug: string;
  organizationName: string;
  role: 'OWNER' | 'ADMIN' | 'AGENT' | 'VIEWER';
};

export type SessionData = {
  user: {
    id: string;
    email: string;
    displayName: string | null;
  };
  memberships: SessionMembership[];
};

export async function getRequestBaseUrl() {
  const requestHeaders = await headers();
  const host = requestHeaders.get('host');
  const proto = requestHeaders.get('x-forwarded-proto') ?? 'http';

  if (!host) {
    throw new Error('Missing host header');
  }

  return `${proto}://${host}`;
}

export async function getSessionForPage() {
  const requestHeaders = await headers();
  const baseUrl = await getRequestBaseUrl();
  const response = await fetch(`${baseUrl}/api/auth/me`, {
    cache: 'no-store',
    headers: {
      cookie: requestHeaders.get('cookie') ?? '',
    },
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const session = (await response.json()) as SessionData;
  const cookieStore = await cookies();
  const selectedOrganizationId =
    cookieStore.get(getAuthCookieNames().organization)?.value ?? null;
  const activeMembership =
    session.memberships.find(
      (membership) => membership.organizationId === selectedOrganizationId,
    ) ?? null;

  return {
    session,
    activeMembership,
    selectedOrganizationId,
    baseUrl,
    cookieHeader: requestHeaders.get('cookie') ?? '',
  };
}

export async function requireSessionForPage() {
  const context = await getSessionForPage();

  if (!context) {
    redirect('/login');
  }

  return context;
}
