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
    <div className="flex flex-wrap items-center gap-2.5">
      {showOrganizationPicker ? (
        <>
          {memberships.length > 1 ? (
            <select
              value={organizationId}
              onChange={(event) => setOrganizationId(event.target.value)}
              className="field-input max-w-[14rem] !py-2 text-sm"
              disabled={isPending}
            >
              {memberships.map((membership) => (
                <option
                  key={membership.organizationId}
                  value={membership.organizationId}
                  className="bg-ink-850 text-mist-50"
                >
                  {membership.organizationName} ({membership.role})
                </option>
              ))}
            </select>
          ) : (
            <div className="badge badge-neutral !text-[0.72rem] !normal-case">
              {memberships[0]?.organizationName}
            </div>
          )}
          <button
            type="button"
            onClick={onSelectOrganization}
            disabled={isPending}
            className="btn btn-ghost"
          >
            {activeOrganizationId ? 'Switch org' : 'Use organization'}
          </button>
        </>
      ) : null}

      <button
        type="button"
        onClick={onLogout}
        disabled={isPending}
        className="btn btn-ghost"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="M16 17l5-5-5-5M21 12H9" />
        </svg>
        Sign out
      </button>

      {error ? <span className="text-sm text-rose-glow">{error}</span> : null}
    </div>
  );
}
