import { useState, type FormEvent } from 'react';
import { apiErrorCode, apiErrorText } from '../api/api';
import { register, signIn } from '../store/actions';
import { useAppSelector } from '../store';
import { Button } from '../ui/Button';
import { Logo } from './Logo';

type Step = 'signIn' | 'create';

/**
 * The website keeps the words on the server, so it starts with the account.
 * An unknown email offers to create the account (like the phone app).
 */
export function SignInPage() {
  const message = useAppSelector(s => s.auth.message);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<Step>('signIn');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (step === 'create') {
        await register(email.trim(), password);
      } else {
        await signIn(email.trim(), password);
      }
    } catch (err) {
      if (step === 'signIn' && apiErrorCode(err) === 'USER_NOT_FOUND') {
        setStep('create');
      } else {
        setError(apiErrorText(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const input =
    'w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-[15px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-3xl border border-line bg-surface p-6 shadow-sm sm:p-8"
      >
        <div className="flex flex-col items-center gap-3 pb-6 text-center">
          <Logo className="size-14" />
          <h1 className="text-2xl font-bold">Words</h1>
          <p className="text-sm text-muted">
            Learn English and German words. Sign in with the same account as in
            the phone app: your words sync both ways.
          </p>
        </div>
        {message ? (
          <p className="mb-4 rounded-xl bg-warning/10 px-3 py-2 text-sm text-warning">{message}</p>
        ) : null}
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={e => {
                setEmail(e.target.value);
                setStep('signIn');
              }}
              placeholder="you@example.com"
              className={input}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">Password</span>
            <input
              type="password"
              autoComplete={step === 'create' ? 'new-password' : 'current-password'}
              required
              minLength={6}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className={input}
            />
          </label>
        </div>
        {step === 'create' ? (
          <p className="mt-4 rounded-xl bg-primary-soft px-3 py-2 text-sm">
            There's no account for <b>{email.trim()}</b> yet. Create one with
            this password?
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm whitespace-pre-line text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={busy} className="mt-5 w-full">
          {busy ? 'Please wait…' : step === 'create' ? 'Create account' : 'Sign in'}
        </Button>
        {step === 'create' ? (
          <Button variant="ghost" className="mt-2 w-full" onClick={() => setStep('signIn')}>
            Use another email
          </Button>
        ) : (
          <p className="mt-4 text-center text-xs text-muted">
            No account yet? Sign in with a new email to create one.
          </p>
        )}
      </form>
    </div>
  );
}
