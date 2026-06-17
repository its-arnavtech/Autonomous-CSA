'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    startTransition(() => {
      void (async () => {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

        if (!response.ok) {
          setError('Invalid email or password.');
          return;
        }

        router.push('/tickets');
        router.refresh();
      })();
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label className="field-label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="field-input"
          required
        />
      </div>

      <div>
        <label className="field-label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••••••"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="field-input"
          required
        />
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-glow/30 bg-rose-glow/10 px-3 py-2 text-sm text-rose-glow">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={isPending} className="btn btn-primary w-full">
        {isPending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
