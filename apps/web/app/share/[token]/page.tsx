'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { type Contents, type DataRoomFile, publicFetch } from '../../../lib/api';

type PublicShare = {
  share: { resourceType: 'DATA_ROOM' | 'FOLDER' | 'FILE'; resourceId: string; dataRoomId: string };
  resource: { id: string; name: string; type: 'DATA_ROOM' | 'FOLDER' | 'FILE'; dataRoomId: string };
};

export default function PublicSharePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [share, setShare] = useState<PublicShare | null>(null);
  const [contents, setContents] = useState<Contents | null>(null);
  const [preview, setPreview] = useState<{ name: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const openContents = useCallback(async (folderId?: string) => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const endpoint = folderId ? `/public-shares/${token}/folders/${folderId}/contents?limit=100` : `/public-shares/${token}/contents?limit=100`;
      setContents(await publicFetch<Contents>(endpoint));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'This shared item is unavailable.');
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      setLoading(true);
      try {
        const result = await publicFetch<PublicShare>(`/public-shares/${token}`);
        setShare(result);
        if (result.share.resourceType === 'FILE') {
          const download = await publicFetch<{ signedUrl: string }>(`/public-shares/${token}/files/${result.share.resourceId}/download`);
          setPreview({ name: result.resource.name, url: download.signedUrl });
        } else {
          await openContents();
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'This shared item is unavailable.');
      } finally { setLoading(false); }
    })();
  }, [openContents, token]);

  async function openFile(file: DataRoomFile) {
    try {
      const result = await publicFetch<{ signedUrl: string }>(`/public-shares/${token}/files/${file.id}/download`);
      setPreview({ name: file.name, url: result.signedUrl });
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not open the document.'); }
  }

  return <main className="min-h-screen bg-canvas"><header className="flex h-16 items-center border-b border-slate-200 bg-white px-5 sm:px-8"><span className="grid h-8 w-8 place-items-center rounded-lg bg-brand font-bold text-white">A</span><span className="ml-2 font-semibold text-ink">Acme Data Room</span><span className="ml-3 hidden rounded-full bg-indigo-50 px-2 py-1 text-xs font-semibold text-brand sm:block">View only</span></header><section className="mx-auto max-w-5xl p-4 sm:p-8">{error ? <div className="mx-auto mt-16 max-w-lg rounded-xl border border-rose-200 bg-rose-50 p-6"><h1 className="font-semibold text-rose-900">Shared item unavailable</h1><p className="mt-2 text-sm leading-6 text-rose-800">{error}</p></div> : preview && share?.share.resourceType === 'FILE' ? <DocumentPreview preview={preview} /> : <><div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><p className="text-xs font-semibold uppercase tracking-wider text-brand">SHARED WITH YOU</p><h1 className="mt-2 text-2xl font-semibold text-ink">{share?.resource.name ?? 'Opening shared data room…'}</h1><p className="mt-2 text-sm text-muted">You have view-only access to this shared item.</p></div><div className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">{loading ? <p className="py-12 text-center text-sm text-muted">Loading documents…</p> : <><div className="mb-5 flex flex-wrap items-center gap-1 text-sm text-muted">{contents?.breadcrumbs.map((crumb, index) => <span key={crumb.id} className="flex items-center gap-1"><button className="max-w-44 truncate hover:text-brand hover:underline" onClick={() => void openContents(crumb.type === 'DATA_ROOM' ? undefined : crumb.id)}>{crumb.name}</button>{index < (contents?.breadcrumbs.length ?? 0) - 1 && <span className="text-slate-300">/</span>}</span>)}</div><PublicTable contents={contents} onFolder={(id) => void openContents(id)} onFile={openFile} /></>}</div></>}</section>{preview && share?.share.resourceType !== 'FILE' && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><div className="w-full max-w-5xl rounded-xl bg-white p-4 shadow-2xl"><div className="mb-3 flex justify-between gap-3"><h2 className="truncate font-semibold text-ink">{preview.name}</h2><button className="text-slate-500 hover:underline" onClick={() => setPreview(null)}>Close</button></div><iframe className="h-[75vh] w-full rounded-lg border border-slate-200" src={preview.url} title={preview.name} /></div></div>}</main>;
}

function DocumentPreview({ preview }: { preview: { name: string; url: string } }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h1 className="mb-4 truncate text-lg font-semibold text-ink">{preview.name}</h1><iframe className="h-[78vh] w-full rounded-lg border border-slate-200" src={preview.url} title={preview.name} /></div>;
}

function PublicTable({ contents, onFolder, onFile }: { contents: Contents | null; onFolder: (id: string) => void; onFile: (file: DataRoomFile) => void }) {
  if (!contents?.folders.length && !contents?.files.length) return <p className="py-12 text-center text-sm text-muted">This folder is empty.</p>;
  return <div className="overflow-x-auto"><table className="w-full min-w-[480px] text-left text-sm"><thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-2 py-3">Name</th><th className="px-2 py-3">Modified</th><th className="px-2 py-3">Size</th></tr></thead><tbody className="divide-y divide-slate-100">{contents?.folders.map((folder) => <tr key={folder.id} className="hover:bg-slate-50"><td className="px-2 py-3"><button className="font-medium text-ink hover:text-brand" onClick={() => onFolder(folder.id)}>▰ {folder.name}</button></td><td className="px-2 py-3 text-muted">{new Date(folder.updatedAt).toLocaleDateString()}</td><td className="px-2 py-3 text-muted">—</td></tr>)}{contents?.files.map((file) => <tr key={file.id} className="hover:bg-slate-50"><td className="px-2 py-3"><button className="font-medium text-ink hover:text-brand" onClick={() => onFile(file)}>▤ {file.name}</button></td><td className="px-2 py-3 text-muted">{new Date(file.updatedAt).toLocaleDateString()}</td><td className="px-2 py-3 text-muted">{Math.max(1, Math.round(file.sizeBytes / 1024))} KB</td></tr>)}</tbody></table></div>;
}
