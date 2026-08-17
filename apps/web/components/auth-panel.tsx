'use client';

import { FormEvent, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabase-browser';

export function AuthPanel({ onAuthenticated }: { onAuthenticated: (session: Session) => void }) {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      const result = mode === 'sign-in'
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password });
      if (result.error) throw result.error;
      if (result.data.session) {
        onAuthenticated(result.data.session);
      } else {
        setMessage('Check your inbox to confirm your account, then sign in.');
        setMode('sign-in');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to authenticate.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-canvas lg:grid-cols-[1.08fr_0.92fr]">
      <section className="hidden bg-ink px-12 py-14 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3 text-lg font-semibold"><span className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-500">A</span> Acme Data Room</div>
        <div className="max-w-xl">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-indigo-200">Due diligence, in order</p>
          <h1 className="text-5xl font-semibold leading-tight">A focused, secure home for your deal documents.</h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-slate-300">Upload PDFs, organize the material, and give the right people read-only access — without exposing the rest of the room.</p>
        </div>
        <p className="text-sm text-slate-400">Private by default · View-only sharing · Revocable links</p>
      </section>

      <section className="flex items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-md rounded-2xl bg-white p-7 shadow-panel sm:p-9">
          <div className="mb-8 lg:hidden"><p className="text-sm font-semibold text-brand">ACME DATA ROOM</p><h1 className="mt-2 text-2xl font-semibold">Keep the deal moving.</h1></div>
          <p className="text-sm font-semibold text-brand">{mode === 'sign-in' ? 'WELCOME BACK' : 'CREATE AN ACCOUNT'}</p>
          <h2 className="mt-2 text-3xl font-semibold text-ink">{mode === 'sign-in' ? 'Sign in to your rooms' : 'Start a private data room'}</h2>
          <p className="mt-3 text-sm leading-6 text-muted">{mode === 'sign-in' ? 'Use your email and password to continue.' : 'You can share with registered users after creating a room.'}</p>

          <form className="mt-7 space-y-4" onSubmit={submit}>
            <label><span className="label">Email</span><input className="input" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label><span className="label">Password</span><input className="input" type="password" autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            {message && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}
            <button type="submit" className="button-primary w-full" disabled={loading}>{loading ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}</button>
          </form>
          <p className="mt-6 text-center text-sm text-muted">{mode === 'sign-in' ? 'New to Acme?' : 'Already have an account?'} <button type="button" className="font-semibold text-brand hover:underline" onClick={() => { setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in'); setError(null); setMessage(null); }}>{mode === 'sign-in' ? 'Create one' : 'Sign in'}</button></p>
        </div>
      </section>
    </main>
  );
}
