'use client';

import { ChangeEvent, DragEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { apiFetch, type Contents, type DataRoom, type DataRoomFile, type Folder, type Share } from '../lib/api';
import { getSupabaseClient } from '../lib/supabase-browser';
import { Modal } from './modal';
import { ShareDialog } from './share-dialog';

type DialogState =
  | { type: 'room' }
  | { type: 'folder' }
  | { type: 'rename-folder'; folder: Folder }
  | { type: 'rename-file'; file: DataRoomFile }
  | { type: 'delete-file'; file: DataRoomFile }
  | { type: 'delete-folder'; folder: Folder; summary: { folderCount: number; fileCount: number; sizeBytes: string } }
  | { type: 'move-file'; file: DataRoomFile; targets: Array<{ id: string | null; name: string }> }
  | { type: 'preview'; file: DataRoomFile; url: string }
  | { type: 'share'; resource: { id: string; name: string; type: 'DATA_ROOM' | 'FOLDER' | 'FILE' } };

type UploadTask = { id: string; name: string; progress: number; state: 'uploading' | 'saving' | 'done' | 'error'; error?: string };
type ActiveLocation = { room: Pick<DataRoom, 'id' | 'name'>; folderId: string | null; owner: boolean; restricted: boolean };

const PAGE_SIZE = 100;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length);
  return `${(bytes / 1024 ** unit).toFixed(unit === 1 ? 0 : 1)} ${units[unit - 1]}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function xhrUpload(url: string, file: File, onProgress: (progress: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url);
    request.setRequestHeader('Content-Type', file.type || 'application/pdf');
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => reject(new Error('The file could not be uploaded to secure storage.'));
    request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(new Error(`Upload failed (${request.status}).`));
    request.send(file);
  });
}

export function DataRoomWorkspace({ session, onSignedOut }: { session: Session; onSignedOut: () => void }) {
  const accessToken = session.access_token;
  const [rooms, setRooms] = useState<DataRoom[]>([]);
  const [receivedShares, setReceivedShares] = useState<Share[]>([]);
  const [active, setActive] = useState<ActiveLocation | null>(null);
  const [contents, setContents] = useState<Contents | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refreshSidebar = useCallback(async () => {
    const [owned, shared] = await Promise.all([
      apiFetch<DataRoom[]>('/data-rooms', accessToken),
      apiFetch<Share[]>('/shares/received', accessToken),
    ]);
    setRooms(owned);
    setReceivedShares(shared);
  }, [accessToken]);

  const loadLocation = useCallback(async (room: Pick<DataRoom, 'id' | 'name'>, folderId: string | null, owner: boolean, restricted = false) => {
    setError(null);
    setLoading(true);
    try {
      const endpoint = folderId ? `/folders/${folderId}/contents?limit=${PAGE_SIZE}` : `/data-rooms/${room.id}/contents?limit=${PAGE_SIZE}`;
      const result = await apiFetch<Contents>(endpoint, accessToken);
      setContents(result);
      setActive({ room, folderId, owner, restricted });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not open this location.');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void (async () => {
      try {
        await refreshSidebar();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not load your data rooms.');
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshSidebar]);

  const refreshCurrent = useCallback(async () => {
    if (!active) return;
    await loadLocation(active.room, active.folderId, active.owner, active.restricted);
  }, [active, loadLocation]);

  async function loadMore() {
    if (!active || !contents || (!contents.nextFolderCursor && !contents.nextFileCursor)) return;
    setWorking(true);
    try {
      const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (contents.nextFolderCursor) query.set('folderCursor', contents.nextFolderCursor);
      if (contents.nextFileCursor) query.set('fileCursor', contents.nextFileCursor);
      const endpoint = active.folderId
        ? `/folders/${active.folderId}/contents?${query}`
        : `/data-rooms/${active.room.id}/contents?${query}`;
      const page = await apiFetch<Contents>(endpoint, accessToken);
      setContents((current) => current ? {
        ...page,
        folders: [...current.folders, ...page.folders],
        files: [...current.files, ...page.files],
      } : page);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load more items.');
    } finally {
      setWorking(false);
    }
  }

  const activeFolderName = useMemo(() => contents?.breadcrumbs.at(-1)?.name ?? active?.room.name ?? 'Data Room', [active?.room.name, contents?.breadcrumbs]);

  async function signOut() {
    await getSupabaseClient().auth.signOut();
    onSignedOut();
  }

  async function openShared(share: Share) {
    if (!share.dataRoom) return;
    if (share.resourceType === 'FILE') {
      try {
        const file = await apiFetch<DataRoomFile>(`/files/${share.resourceId}`, accessToken);
        await previewFile(file);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not open this shared file.');
      }
      return;
    }
    await loadLocation(share.dataRoom, share.resourceType === 'FOLDER' ? share.resourceId : null, false, share.resourceType === 'FOLDER');
  }

  async function submitNewRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    if (!name) return;
    setWorking(true);
    try {
      const room = await apiFetch<DataRoom>('/data-rooms', accessToken, { method: 'POST', body: JSON.stringify({ name }) });
      await refreshSidebar();
      setDialog(null);
      await loadLocation(room, null, true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not create the data room.'); }
    finally { setWorking(false); }
  }

  async function submitFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!active) return;
    const name = String(new FormData(event.currentTarget).get('name') ?? '').trim();
    if (!name) return;
    setWorking(true);
    try {
      await apiFetch<Folder>(`/data-rooms/${active.room.id}/folders`, accessToken, { method: 'POST', body: JSON.stringify({ name, ...(active.folderId ? { parentId: active.folderId } : {}) }) });
      setDialog(null); await refreshCurrent();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not create the folder.'); }
    finally { setWorking(false); }
  }

  async function rename(target: Folder | DataRoomFile, isFolder: boolean, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get('name') ?? '').trim();
    if (!name) return;
    setWorking(true);
    try {
      await apiFetch(isFolder ? `/folders/${target.id}` : `/files/${target.id}`, accessToken, { method: 'PATCH', body: JSON.stringify({ name }) });
      setDialog(null); await refreshCurrent();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not rename the item.'); }
    finally { setWorking(false); }
  }

  async function prepareFolderDelete(folder: Folder) {
    setWorking(true);
    try {
      const summary = await apiFetch<{ folderCount: number; fileCount: number; sizeBytes: string }>(`/folders/${folder.id}/deletion-summary`, accessToken);
      setDialog({ type: 'delete-folder', folder, summary });
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not prepare deletion.'); }
    finally { setWorking(false); }
  }

  async function deleteItem(path: string) {
    setWorking(true);
    try {
      await apiFetch<void>(path, accessToken, { method: 'DELETE' });
      setDialog(null); await refreshCurrent();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not delete the item.'); }
    finally { setWorking(false); }
  }

  async function previewFile(file: DataRoomFile) {
    try {
      const result = await apiFetch<{ signedUrl: string }>(`/files/${file.id}/download`, accessToken);
      setDialog({ type: 'preview', file, url: result.signedUrl });
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not open the document.'); }
  }

  async function collectFolders(): Promise<Array<{ id: string | null; name: string }>> {
    if (!active) return [];
    const options: Array<{ id: string | null; name: string }> = [{ id: null, name: `${active.room.name} (root)` }];
    const queue: Array<{ id: string | null; prefix: string }> = [{ id: null, prefix: '' }];
    while (queue.length) {
      const current = queue.shift()!;
      const endpoint = current.id ? `/folders/${current.id}/contents?limit=${PAGE_SIZE}` : `/data-rooms/${active.room.id}/contents?limit=${PAGE_SIZE}`;
      const page = await apiFetch<Contents>(endpoint, accessToken);
      for (const folder of page.folders) {
        options.push({ id: folder.id, name: `${current.prefix}${folder.name}` });
        queue.push({ id: folder.id, prefix: `${current.prefix}— ` });
      }
    }
    return options;
  }

  async function openMove(file: DataRoomFile) {
    setWorking(true);
    try {
      const options = await collectFolders();
      setDialog({ type: 'move-file', file, targets: options });
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load destination folders.'); }
    finally { setWorking(false); }
  }

  async function moveFile(file: DataRoomFile, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const folderId = String(new FormData(event.currentTarget).get('folderId') ?? '');
    setWorking(true);
    try {
      await apiFetch(`/files/${file.id}/move`, accessToken, { method: 'POST', body: JSON.stringify({ folderId: folderId || null }) });
      setDialog(null); await refreshCurrent();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not move the file.'); }
    finally { setWorking(false); }
  }

  function updateTask(id: string, patch: Partial<UploadTask>) {
    setTasks((current) => current.map((task) => task.id === id ? { ...task, ...patch } : task));
  }

  async function uploadFiles(files: File[]) {
    if (!active || !active.owner) return;
    const valid = files.filter((file) => file.type === 'application/pdf' && /\.pdf$/i.test(file.name) && file.size > 0 && file.size <= 50 * 1024 * 1024);
    const invalidCount = files.length - valid.length;
    if (invalidCount) setError(`${invalidCount} file(s) skipped. Upload PDF files up to 50 MB.`);
    const nextTasks = valid.map((file) => ({ id: crypto.randomUUID(), name: file.name, progress: 0, state: 'uploading' as const }));
    setTasks((current) => [...nextTasks, ...current].slice(0, 12));
    await Promise.all(valid.map(async (file, index) => {
      const taskId = nextTasks[index].id;
      try {
        const dto = { dataRoomId: active.room.id, ...(active.folderId ? { folderId: active.folderId } : {}), fileName: file.name, mimeType: 'application/pdf', sizeBytes: file.size };
        const intent = await apiFetch<{ storageKey: string; signedUrl: string }>('/files/upload-intents', accessToken, { method: 'POST', body: JSON.stringify(dto) });
        await xhrUpload(intent.signedUrl, file, (progress) => updateTask(taskId, { progress }));
        updateTask(taskId, { state: 'saving', progress: 100 });
        await apiFetch('/files/complete', accessToken, { method: 'POST', body: JSON.stringify({ ...dto, storageKey: intent.storageKey }) });
        updateTask(taskId, { state: 'done', progress: 100 });
      } catch (caught) {
        updateTask(taskId, { state: 'error', error: caught instanceof Error ? caught.message : 'Upload failed.' });
      }
    }));
    await refreshCurrent();
  }

  function onFileInput(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    void uploadFiles(files);
  }

  function onDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    void uploadFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <main className="min-h-screen bg-canvas">
      <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
        <button className="flex items-center gap-2 text-left" onClick={() => { setActive(null); setContents(null); }}><span className="grid h-8 w-8 place-items-center rounded-lg bg-brand font-bold text-white">A</span><span className="font-semibold text-ink">Acme Data Room</span></button>
        <div className="flex items-center gap-3"><span className="hidden text-sm text-muted sm:block">{session.user.email}</span><button className="button-secondary h-9 px-3" onClick={() => void signOut()}>Sign out</button></div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-5 p-4 lg:grid-cols-[250px_1fr] lg:p-6">
        <aside className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <button className="button-primary mb-5 w-full" onClick={() => setDialog({ type: 'room' })}>+ New data room</button>
          <p className="px-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Your data rooms</p>
          <nav className="mt-2 space-y-1">
            {rooms.map((room) => <button key={room.id} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm ${active?.owner && active.room.id === room.id ? 'bg-indigo-50 font-semibold text-brand' : 'text-slate-700 hover:bg-slate-50'}`} onClick={() => void loadLocation(room, null, true)}>▣ <span className="truncate">{room.name}</span></button>)}
            {!loading && rooms.length === 0 && <p className="px-2 py-2 text-sm text-muted">No data rooms yet.</p>}
          </nav>
          <div className="mt-6 border-t border-slate-100 pt-5"><p className="px-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Shared with you</p><nav className="mt-2 space-y-1">{receivedShares.map((share) => <button key={share.id} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-50" onClick={() => void openShared(share)}>↗ <span className="truncate">{share.dataRoom?.name ?? 'Shared item'}</span></button>)}{!loading && receivedShares.length === 0 && <p className="px-2 py-2 text-sm text-muted">Nothing shared with you.</p>}</nav></div>
        </aside>

        <section className="min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm">
          {!active ? <EmptyState onCreate={() => setDialog({ type: 'room' })} /> : <>
            <div className="border-b border-slate-100 px-5 py-5 sm:px-7">
              <div className="flex flex-wrap items-center justify-between gap-4"><div><Breadcrumbs contents={contents} onOpen={(id, type) => void loadLocation(active.room, type === 'DATA_ROOM' ? null : id, active.owner, active.restricted)} /><h1 className="mt-2 text-xl font-semibold text-ink">{activeFolderName}</h1>{!active.owner && <p className="mt-1 text-sm text-muted">Shared with you · view only</p>}</div>
                {active.owner && <div className="flex flex-wrap gap-2"><button className="button-secondary" onClick={() => setDialog({ type: 'share', resource: { id: active.folderId ?? active.room.id, name: activeFolderName, type: active.folderId ? 'FOLDER' : 'DATA_ROOM' } })}>Share</button><button className="button-secondary" onClick={() => setDialog({ type: 'folder' })}>New folder</button><button className="button-primary" onClick={() => inputRef.current?.click()}>Upload PDFs</button><input ref={inputRef} className="hidden" type="file" accept="application/pdf,.pdf" multiple onChange={onFileInput} /></div>}
              </div>
            </div>
            {error && <div className="mx-5 mt-5 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 sm:mx-7" role="alert">{error}</div>}
            {active.owner && <button type="button" className="mx-5 mt-5 flex w-[calc(100%-2.5rem)] items-center justify-center rounded-xl border border-dashed border-indigo-200 bg-indigo-50/50 px-4 py-4 text-sm text-indigo-800 hover:bg-indigo-50 sm:mx-7 sm:w-[calc(100%-3.5rem)]" onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>Drop PDFs here, or choose files · up to 50 MB each</button>}
            <div className="p-5 sm:p-7">
              {loading ? <p className="py-12 text-center text-sm text-muted">Loading contents…</p> : <FileTable folders={contents?.folders ?? []} files={contents?.files ?? []} owner={active.owner} onFolder={(folder) => void loadLocation(active.room, folder.id, active.owner, active.restricted)} onPreview={previewFile} onRenameFolder={(folder) => setDialog({ type: 'rename-folder', folder })} onRenameFile={(file) => setDialog({ type: 'rename-file', file })} onDeleteFolder={prepareFolderDelete} onDeleteFile={(file) => setDialog({ type: 'delete-file', file })} onMove={openMove} onShare={(resource) => setDialog({ type: 'share', resource })} />}
              {contents && (contents.nextFolderCursor || contents.nextFileCursor) && <div className="mt-5 text-center"><button className="button-secondary" disabled={working} onClick={() => void loadMore()}>{working ? 'Loading…' : 'Load more items'}</button></div>}
            </div>
          </>}
        </section>
      </div>
      {tasks.length > 0 && <div className="fixed bottom-4 right-4 z-40 w-[min(390px,calc(100%-2rem))] rounded-xl border border-slate-200 bg-white p-4 shadow-panel"><div className="mb-3 flex items-center justify-between"><p className="font-semibold text-ink">Uploads</p><button className="text-sm text-muted hover:underline" onClick={() => setTasks((current) => current.filter((task) => task.state === 'uploading' || task.state === 'saving'))}>Clear finished</button></div><ul className="space-y-3">{tasks.map((task) => <li key={task.id}><div className="mb-1 flex justify-between gap-2 text-sm"><span className="truncate text-slate-700">{task.name}</span><span className={task.state === 'error' ? 'text-rose-600' : task.state === 'done' ? 'text-emerald-600' : 'text-muted'}>{task.state === 'error' ? 'Failed' : task.state === 'done' ? 'Done' : task.state === 'saving' ? 'Saving…' : `${task.progress}%`}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${task.state === 'error' ? 'bg-rose-500' : task.state === 'done' ? 'bg-emerald-500' : 'bg-brand'}`} style={{ width: `${task.progress}%` }} /></div>{task.error && <p className="mt-1 text-xs text-rose-600">{task.error}</p>}</li>)}</ul></div>}
      {dialog && <Dialogs dialog={dialog} accessToken={accessToken} working={working} onClose={() => setDialog(null)} onNewRoom={submitNewRoom} onNewFolder={submitFolder} onRename={rename} onDelete={deleteItem} onMove={moveFile} />}
    </main>
  );
}

function Breadcrumbs({ contents, onOpen }: { contents: Contents | null; onOpen: (id: string, type: 'DATA_ROOM' | 'FOLDER') => void }) {
  if (!contents?.breadcrumbs.length) return null;
  return <div className="flex flex-wrap items-center gap-1 text-sm text-muted">{contents.breadcrumbs.map((crumb, index) => <span key={crumb.id} className="flex items-center gap-1"><button className={`max-w-44 truncate hover:text-brand hover:underline ${index === contents.breadcrumbs.length - 1 ? 'font-medium text-slate-600' : ''}`} onClick={() => onOpen(crumb.id, crumb.type)}>{crumb.name}</button>{index < contents.breadcrumbs.length - 1 && <span className="text-slate-300">/</span>}</span>)}</div>;
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return <div className="grid min-h-[520px] place-items-center p-7 text-center"><div className="max-w-sm"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-indigo-50 text-2xl">▣</div><h1 className="mt-5 text-2xl font-semibold text-ink">Your deal starts here</h1><p className="mt-3 leading-6 text-muted">Create a private data room, add folders and PDFs, then share exactly what a recipient needs to see.</p><button className="button-primary mt-6" onClick={onCreate}>Create data room</button></div></div>;
}

function FileTable({ folders, files, owner, onFolder, onPreview, onRenameFolder, onRenameFile, onDeleteFolder, onDeleteFile, onMove, onShare }: { folders: Folder[]; files: DataRoomFile[]; owner: boolean; onFolder: (folder: Folder) => void; onPreview: (file: DataRoomFile) => void; onRenameFolder: (folder: Folder) => void; onRenameFile: (file: DataRoomFile) => void; onDeleteFolder: (folder: Folder) => void; onDeleteFile: (file: DataRoomFile) => void; onMove: (file: DataRoomFile) => void; onShare: (resource: { id: string; name: string; type: 'FOLDER' | 'FILE' }) => void }) {
  if (!folders.length && !files.length) return <div className="py-12 text-center"><p className="font-medium text-ink">This folder is empty</p><p className="mt-1 text-sm text-muted">Create a folder or upload a PDF to get started.</p></div>;
  return <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-2 py-3 font-semibold">Name</th><th className="px-2 py-3 font-semibold">Modified</th><th className="px-2 py-3 font-semibold">Size</th><th className="px-2 py-3"><span className="sr-only">Actions</span></th></tr></thead><tbody className="divide-y divide-slate-100">{folders.map((folder) => <tr key={folder.id} className="hover:bg-slate-50"><td className="px-2 py-3"><button className="flex max-w-[300px] items-center gap-2 font-medium text-ink hover:text-brand" onClick={() => onFolder(folder)}><span className="text-lg">▰</span><span className="truncate">{folder.name}</span></button></td><td className="px-2 py-3 text-muted">{formatDate(folder.updatedAt)}</td><td className="px-2 py-3 text-muted">—</td><td className="px-2 py-3 text-right">{owner && <RowActions actions={[['Share', () => onShare({ id: folder.id, name: folder.name, type: 'FOLDER' })], ['Rename', () => onRenameFolder(folder)], ['Delete', () => onDeleteFolder(folder), true]]} />}</td></tr>)}{files.map((file) => <tr key={file.id} className="hover:bg-slate-50"><td className="px-2 py-3"><button className="flex max-w-[300px] items-center gap-2 font-medium text-ink hover:text-brand" onClick={() => onPreview(file)}><span className="text-lg">▤</span><span className="truncate">{file.name}</span></button></td><td className="px-2 py-3 text-muted">{formatDate(file.updatedAt)}</td><td className="px-2 py-3 text-muted">{formatBytes(file.sizeBytes)}</td><td className="px-2 py-3 text-right">{owner ? <RowActions actions={[['Preview', () => onPreview(file)], ['Share', () => onShare({ id: file.id, name: file.name, type: 'FILE' })], ['Rename', () => onRenameFile(file)], ['Move', () => onMove(file)], ['Delete', () => onDeleteFile(file), true]]} /> : <button className="text-sm font-semibold text-brand hover:underline" onClick={() => onPreview(file)}>Preview</button>}</td></tr>)}</tbody></table></div>;
}

function RowActions({ actions }: { actions: Array<[string, () => void, boolean?]> }) {
  return <details className="relative inline-block text-left"><summary className="cursor-pointer list-none rounded-lg px-2 py-1 text-lg text-slate-500 hover:bg-slate-100">⋯</summary><div className="absolute right-0 z-20 mt-1 w-32 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">{actions.map(([label, onClick, danger]) => <button key={label} className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${danger ? 'text-rose-600' : 'text-slate-700'}`} onClick={(event) => { (event.currentTarget.parentElement?.parentElement as HTMLDetailsElement | null)?.removeAttribute('open'); onClick(); }}>{label}</button>)}</div></details>;
}

function Dialogs({ dialog, accessToken, working, onClose, onNewRoom, onNewFolder, onRename, onDelete, onMove }: { dialog: DialogState; accessToken: string; working: boolean; onClose: () => void; onNewRoom: (event: FormEvent<HTMLFormElement>) => void; onNewFolder: (event: FormEvent<HTMLFormElement>) => void; onRename: (target: Folder | DataRoomFile, isFolder: boolean, event: FormEvent<HTMLFormElement>) => void; onDelete: (path: string) => void; onMove: (file: DataRoomFile, event: FormEvent<HTMLFormElement>) => void }) {
  if (dialog.type === 'share') return <ShareDialog accessToken={accessToken} resource={dialog.resource} onClose={onClose} />;
  if (dialog.type === 'room') return <Modal title="Create data room" onClose={onClose}><form className="space-y-5" onSubmit={onNewRoom}><label><span className="label">Name</span><input autoFocus className="input" name="name" placeholder="Acme — Project Atlas" maxLength={120} required /></label><p className="text-sm text-muted">Only you can see the room until you explicitly share it.</p><div className="flex justify-end gap-2"><button type="button" className="button-secondary" onClick={onClose}>Cancel</button><button className="button-primary" disabled={working}>Create room</button></div></form></Modal>;
  if (dialog.type === 'folder') return <Modal title="New folder" onClose={onClose}><form className="space-y-5" onSubmit={onNewFolder}><label><span className="label">Folder name</span><input autoFocus className="input" name="name" placeholder="Financial statements" maxLength={120} required /></label><div className="flex justify-end gap-2"><button type="button" className="button-secondary" onClick={onClose}>Cancel</button><button className="button-primary" disabled={working}>Create folder</button></div></form></Modal>;
  if (dialog.type === 'rename-folder' || dialog.type === 'rename-file') { const target = dialog.type === 'rename-folder' ? dialog.folder : dialog.file; const isFolder = dialog.type === 'rename-folder'; return <Modal title={`Rename ${isFolder ? 'folder' : 'file'}`} onClose={onClose}><form className="space-y-5" onSubmit={(event) => onRename(target, isFolder, event)}><label><span className="label">Name</span><input autoFocus className="input" name="name" defaultValue={target.name} maxLength={255} required /></label><div className="flex justify-end gap-2"><button type="button" className="button-secondary" onClick={onClose}>Cancel</button><button className="button-primary" disabled={working}>Save name</button></div></form></Modal>; }
  if (dialog.type === 'delete-file') return <Modal title="Delete file?" onClose={onClose}><p className="text-sm leading-6 text-muted">“{dialog.file.name}” will be permanently removed from this data room. Shared access to it will stop immediately.</p><div className="mt-6 flex justify-end gap-2"><button className="button-secondary" onClick={onClose}>Cancel</button><button className="button-danger" disabled={working} onClick={() => void onDelete(`/files/${dialog.file.id}`)}>Delete file</button></div></Modal>;
  if (dialog.type === 'delete-folder') return <Modal title="Delete folder and contents?" onClose={onClose}><p className="text-sm leading-6 text-muted">This permanently deletes “{dialog.folder.name}”, its nested folders, and its files. Anyone viewing a shared item inside it will lose access.</p><dl className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-rose-50 p-3 text-center text-sm"><div><dt className="text-rose-700">Folders</dt><dd className="mt-1 font-semibold text-rose-900">{dialog.summary.folderCount}</dd></div><div><dt className="text-rose-700">Files</dt><dd className="mt-1 font-semibold text-rose-900">{dialog.summary.fileCount}</dd></div><div><dt className="text-rose-700">Storage</dt><dd className="mt-1 font-semibold text-rose-900">{formatBytes(Number(dialog.summary.sizeBytes))}</dd></div></dl><div className="mt-6 flex justify-end gap-2"><button className="button-secondary" onClick={onClose}>Cancel</button><button className="button-danger" disabled={working} onClick={() => void onDelete(`/folders/${dialog.folder.id}`)}>Delete everything</button></div></Modal>;
  if (dialog.type === 'move-file') return <Modal title="Move file" onClose={onClose}><form className="space-y-5" onSubmit={(event) => onMove(dialog.file, event)}><p className="text-sm text-muted">Choose a destination for “{dialog.file.name}”. A duplicate name is resolved automatically.</p><label><span className="label">Destination</span><select name="folderId" className="input" defaultValue={dialog.file.folderId ?? ''}>{dialog.targets.map((target) => <option key={target.id ?? 'root'} value={target.id ?? ''}>{target.name}</option>)}</select></label><div className="flex justify-end gap-2"><button type="button" className="button-secondary" onClick={onClose}>Cancel</button><button className="button-primary" disabled={working}>Move file</button></div></form></Modal>;
  if (dialog.type === 'preview') return <Modal title={dialog.file.name} onClose={onClose} size="wide"><iframe className="h-[70vh] w-full rounded-lg border border-slate-200" src={dialog.url} title={dialog.file.name} /><a className="mt-4 inline-block text-sm font-semibold text-brand hover:underline" href={dialog.url} target="_blank" rel="noreferrer">Open in a new tab</a></Modal>;
  return null;
}
