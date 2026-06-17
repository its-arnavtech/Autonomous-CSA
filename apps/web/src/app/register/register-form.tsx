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

      {error ? (
        <p className="rounded-lg border border-rose-glow/30 bg-rose-glow/10 px-3 py-2 text-sm text-rose-glow">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={isPending} className="btn btn-primary w-full">
        {isPending ? 'Creating account…' : 'Create account'}
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
    <div>
      <label className="field-label" htmlFor={props.id}>
        {props.label}
      </label>
      <input
        id={props.id}
        type={props.type ?? 'text'}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className="field-input"
        required={props.required}
      />
      {props.hint ? <p className="mt-1.5 text-xs text-mist-500">{props.hint}</p> : null}
    </div>
  );
}
