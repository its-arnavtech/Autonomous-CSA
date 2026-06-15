'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

export function RegisterForm() {
  const router = useRouter();
  const [form, setForm] = useState({
    displayName: '',
    email: '',
    password: '',
    organizationName: '',
    organizationSlug: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    startTransition(() => {
      void (async () => {
        const response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ...form,
            organizationSlug: form.organizationSlug || undefined,
            displayName: form.displayName || undefined,
          }),
        });

        if (!response.ok) {
          setError('Unable to create account. Check the form values and try again.');
          return;
        }

        router.push('/tickets');
        router.refresh();
      })();
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id="displayName"
          label="Display name"
          value={form.displayName}
          onChange={(value) => setForm((current) => ({ ...current, displayName: value }))}
        />
        <Field
          id="email"
          label="Email"
          type="email"
          value={form.email}
          onChange={(value) => setForm((current) => ({ ...current, email: value }))}
          required
        />
      </div>

      <Field
        id="password"
        label="Password"
        type="password"
        hint="Use at least 12 characters with letters and numbers."
        value={form.password}
        onChange={(value) => setForm((current) => ({ ...current, password: value }))}
        required
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id="organizationName"
          label="Organization name"
          value={form.organizationName}
          onChange={(value) =>
            setForm((current) => ({ ...current, organizationName: value }))
          }
          required
        />
        <Field
          id="organizationSlug"
          label="Organization slug"
          hint="Optional lowercase slug."
          value={form.organizationSlug}
          onChange={(value) =>
            setForm((current) => ({ ...current, organizationSlug: value }))
          }
        />
      </div>

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white"
      >
        {isPending ? 'Creating account...' : 'Create Account'}
      </button>
    </form>
  );
}

function Field(props: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  hint?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-700" htmlFor={props.id}>
        {props.label}
      </label>
      <input
        id={props.id}
        type={props.type ?? 'text'}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900"
        required={props.required}
      />
      {props.hint ? <p className="text-xs text-slate-500">{props.hint}</p> : null}
    </div>
  );
}
