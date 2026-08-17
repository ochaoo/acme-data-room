'use client';

import { FormEvent, useEffect, useState } from 'react';
import { apiFetch, type Share } from '../lib/api';
import { Modal } from './modal';

type ShareDialogProps = {
  accessToken: string;
  resource: { id: string; name: string; type: 'DATA_ROOM' | 'FOLDER' | 'FILE' };
  onClose: () => void;
};

export function ShareDialog({ accessToken, resource, onClose }: ShareDialogProps) {
  const [mode, setMode] = useState<'USER' | 'PUBLIC'>('USER');
  const [email, setEmail] = useState('');
  const [shares, setShares] = useState<Share[]>([]);
  const [publicLink, setPublicLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadShares() {
    setLoading(true);
    try {
      const result = await apiFetch<Share[]>(`/shares/resources/${resource.type}/${resource.id}`, accessToken);
      setShares(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load sharing settings.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadShares(); }, [resource.id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const result = await apiFetch<{ share: Share; publicToken: string | null }>('/shares', accessToken, {
        method: 'POST',
        body: JSON.stringify({
          resourceType: resource.type,
          resourceId: resource.id,
          shareType: mode,
          ...(mode === 'USER' ? { granteeEmail: email.trim() } : {}),
        }),
      });
      if (result.publicToken) {
        const link = `${window.location.origin}/share/${result.publicToken}`;
        setPublicLink(link);
        try { await navigator.clipboard.writeText(link); } catch { /* Clipboard access is optional. */ }
      }
      setEmail('');
      await loadShares();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the share.');
    } finally {
      setSaving(false);
    }
  }

  async function revoke(shareId: string) {
    setError(null);
    try {
      await apiFetch<void>(`/shares/${shareId}`, accessToken, { method: 'DELETE' });
      setPublicLink(null);
      await loadShares();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not revoke the share.');
    }
  }

  return (
    <Modal title={`Share “${resource.name}”`} onClose={onClose}>
      <p className="-mt-2 mb-5 text-sm leading-6 text-muted">Recipients can view this item and its eligible nested content. They cannot change or download anything outside the shared scope.</p>
      <div className="mb-4 flex rounded-lg bg-slate-100 p-1">
        <button type="button" className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold ${mode === 'USER' ? 'bg-white text-ink shadow-sm' : 'text-muted'}`} onClick={() => setMode('USER')}>Specific person</button>
        <button type="button" className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold ${mode === 'PUBLIC' ? 'bg-white text-ink shadow-sm' : 'text-muted'}`} onClick={() => setMode('PUBLIC')}>Anyone with link</button>
      </div>
      <form className="space-y-3" onSubmit={submit}>
        {mode === 'USER' ? (
          <label><span className="label">Registered user’s email</span><input className="input" type="email" placeholder="investor@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        ) : <p className="rounded-lg bg-indigo-50 px-3 py-3 text-sm leading-5 text-indigo-800">A private, view-only link will be created. You can revoke it here at any time.</p>}
        {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <button className="button-primary w-full" type="submit" disabled={saving}>{saving ? 'Creating…' : mode === 'USER' ? 'Grant view access' : 'Create link'}</button>
      </form>

      {publicLink && <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3"><p className="text-sm font-semibold text-emerald-800">Link ready</p><p className="mt-1 break-all text-sm text-emerald-700">{publicLink}</p><button type="button" className="mt-2 text-sm font-semibold text-emerald-800 underline" onClick={() => navigator.clipboard.writeText(publicLink).catch(() => undefined)}>Copy link</button></div>}

      <div className="mt-7 border-t border-slate-100 pt-5">
        <h3 className="text-sm font-semibold text-ink">Active access</h3>
        {loading ? <p className="mt-3 text-sm text-muted">Loading access list…</p> : shares.length === 0 ? <p className="mt-3 text-sm text-muted">No active shares yet.</p> : (
          <ul className="mt-3 divide-y divide-slate-100">
            {shares.map((share) => <li key={share.id} className="flex items-center justify-between gap-3 py-3 text-sm"><span className="min-w-0"><strong className="block truncate text-ink">{share.shareType === 'PUBLIC' ? 'Anyone with the link' : share.granteeUser?.email}</strong><span className="text-muted">View only</span></span><button type="button" className="text-sm font-semibold text-rose-600 hover:underline" onClick={() => void revoke(share.id)}>Revoke</button></li>)}
          </ul>
        )}
      </div>
    </Modal>
  );
}
