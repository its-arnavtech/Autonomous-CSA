import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { canManageOperations, isSupportedOperationsRole } from './access';
import { OperationsActions } from './operations-actions';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

describe('operations access behavior', () => {
  it('denies unsupported roles defensively', () => {
    expect(isSupportedOperationsRole('OWNER')).toBe(true);
    expect(isSupportedOperationsRole('VIEWER')).toBe(true);
    expect(isSupportedOperationsRole('SUPERADMIN')).toBe(false);
  });

  it('does not allow viewers to manage replays', () => {
    expect(canManageOperations('VIEWER')).toBe(false);

    const markup = renderToStaticMarkup(
      <OperationsActions failureId="failure_1" canManage={false} />,
    );

    expect(markup).toContain('Read-only');
    expect(markup).not.toContain('Replay');
  });
});
