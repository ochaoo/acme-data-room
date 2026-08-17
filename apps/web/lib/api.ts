export type DataRoom = {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
};

export type Folder = {
  id: string;
  dataRoomId: string;
  parentId: string | null;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type DataRoomFile = {
  id: string;
  dataRoomId: string;
  folderId: string | null;
  name: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
};

export type Breadcrumb = {
  id: string;
  name: string;
  type: 'DATA_ROOM' | 'FOLDER';
};

export type Contents = {
  breadcrumbs: Breadcrumb[];
  folders: Folder[];
  files: DataRoomFile[];
  nextFolderCursor: string | null;
  nextFileCursor: string | null;
};

export type Share = {
  id: string;
  resourceType: 'DATA_ROOM' | 'FOLDER' | 'FILE';
  resourceId: string;
  shareType: 'PUBLIC' | 'USER';
  role: 'VIEWER' | 'EDITOR';
  granteeUser?: { email: string; displayName: string | null } | null;
  dataRoom?: { id: string; name: string };
  createdAt: string;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function getApiUrl() {
  const url = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '');
  if (!url) {
    throw new Error('NEXT_PUBLIC_API_URL is not configured. Add it to apps/web/.env.local.');
  }
  return url;
}

export async function apiFetch<T>(path: string, accessToken: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${getApiUrl()}${path}`, { ...init, headers });
  if (response.status === 204) return undefined as T;

  const body = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
  if (!response.ok) {
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    throw new ApiError(message || 'Something went wrong. Please try again.', response.status);
  }
  return body as T;
}

export async function publicFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${getApiUrl()}${path}`);
  const body = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
  if (!response.ok) {
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    throw new ApiError(message || 'This shared item is no longer available.', response.status);
  }
  return body as T;
}
