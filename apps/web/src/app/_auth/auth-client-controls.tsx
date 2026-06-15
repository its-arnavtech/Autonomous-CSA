'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { SessionMembership } from './server-auth';

type ControlsProps = {
  memberships: SessionMembership[];
  activeOrganizationId?: string | null;
};

export function AuthClientControls({
  memberships,
  activeOrganizationId,
}: ControlsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [organizationId, setOrganizationId] = useState(
    activeOrganizationId ?? memberships[0]?.organizationId ?? '',
  );
  const [error, setError] = useState<string | null>(null);
  const showOrganizationPicker =
    memberships.length > 1 || activeOrganizationId == null;

  const onSelectOrganization = () => {
    setError(null);
    startTransition(() => {
      void (async () => {
        const response = await fetch('/api/auth/organization', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ organizationId }),
        });

        if (!response.ok) {
          setError('Unable to switch organizations.');
          return;
        }

        router.refresh();
      })();
    });
  };

  const onLogout = () => {
    setError(null);
    startTransition(() => {
      void (async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        router.push('/login');
        router.refresh();
      })();
    });
  };

  return (
      <div className="flex flex-wrap items-center gap-3">
      {showOrganizationPicker ? (
        <>
          {memberships.length > 1 ? (
            <select
              value={organizationId}
              onChange={(event) => setOrganizationId(event.target.value)}
              className="rounded-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
              disabled={isPending}
            >
              {memberships.map((membership) => (
                <option
                  key={membership.organizationId}
                  value={membership.organizationId}
                >
                  {membership.organizationName} ({membership.role})
                </option>
              ))}
            </select>
          ) : (
            <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600">
              {memberships[0]?.organizationName}
            </div>
          )}
          <button
            type="button"
            onClick={onSelectOrganization}
            disabled={isPending}
            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
          >
            {activeOrganizationId ? 'Switch Org' : 'Use Organization'}
          </button>
        </>
      ) : null}

      <button
        type="button"
        onClick={onLogout}
        disabled={isPending}
        className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white"
      >
        Logout
      </button>

      {error ? <span className="text-sm text-rose-700">{error}</span> : null}
    </div>
  );
}
