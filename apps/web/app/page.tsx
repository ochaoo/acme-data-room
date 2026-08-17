'use client';

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AuthPanel } from '../components/auth-panel';
import { DataRoomWorkspace } from '../components/data-room-workspace';
import { getSupabaseClient } from '../lib/supabase-browser';

export default function HomePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [configurationError, setConfigurationError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const supabase = getSupabaseClient();
      void supabase.auth.getSession().then(({ data }) => {
        setSession(data.session);
        setLoading(false);
      });
      const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
      return () => subscription.subscription.unsubscribe();
    } catch (caught) {
      setConfigurationError(caught instanceof Error ? caught.message : 'The application is not configured.');
      setLoading(false);
    }
  }, []);

  if (loading) return <main className="grid min-h-screen place-items-center bg-canvas text-sm text-muted">Loading Acme Data Room…</main>;
  if (configurationError) return <main className="grid min-h-screen place-items-center bg-canvas p-6"><div className="max-w-lg rounded-xl border border-amber-200 bg-amber-50 p-6"><h1 className="font-semibold text-amber-900">Configuration required</h1><p className="mt-2 text-sm leading-6 text-amber-800">{configurationError}</p></div></main>;
  return session ? <DataRoomWorkspace session={session} onSignedOut={() => setSession(null)} /> : <AuthPanel onAuthenticated={setSession} />;
}
