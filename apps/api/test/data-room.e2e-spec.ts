import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

interface TestUser {
  id: string;
  email: string;
  accessToken: string;
}

interface DataRoomResponse {
  id: string;
  name: string;
}

interface FolderResponse {
  id: string;
  name: string;
}

interface UploadIntentResponse {
  storageKey: string;
  token: string;
}

const PDF_CONTENT = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
const testRunId = `aqa-${Date.now()}-${Math.random().toString(16).slice(2)}`;

loadEnvironmentFile();
jest.setTimeout(90_000);

describe('Data Room API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let supabase: SupabaseClient;
  let owner: TestUser;
  let recipient: TestUser;
  const storageKeys: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    owner = await createUser(supabase, 'owner');
    recipient = await createUser(supabase, 'recipient');

    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    if (storageKeys.length) {
      await supabase.storage.from(process.env.SUPABASE_STORAGE_BUCKET!).remove(storageKeys);
    }
    await prisma.dataRoom.deleteMany({ where: { ownerId: { in: [owner.id, recipient.id] } } });
    await Promise.all([owner, recipient].map((user) => supabase.auth.admin.deleteUser(user.id)));
    await app.close();
    await prisma.$disconnect();
  });

  it('should create nested folders and return their complete breadcrumb trail', async () => {
    const room = await createDataRoom(owner, 'Acme acquisition');
    const legal = await createFolder(owner, room.id, 'Legal');
    const contracts = await createFolder(owner, room.id, 'Contracts', legal.id);

    const response = await request(app.getHttpServer())
      .get(`/folders/${contracts.id}/contents`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    expect(response.body.breadcrumbs).toEqual([
      { id: room.id, name: room.name, type: 'DATA_ROOM' },
      { id: legal.id, name: legal.name, type: 'FOLDER' },
      { id: contracts.id, name: contracts.name, type: 'FOLDER' },
    ]);
  });

  it('should give a permissioned recipient read-only access to a shared folder', async () => {
    const room = await createDataRoom(owner, 'Read only room');
    const legal = await createFolder(owner, room.id, 'Legal');
    const share = await request(app.getHttpServer())
      .post('/shares')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ resourceType: 'FOLDER', resourceId: legal.id, shareType: 'USER', granteeEmail: recipient.email })
      .expect(201);

    expect(share.body.share.role).toBe('VIEWER');
    await request(app.getHttpServer())
      .get(`/folders/${legal.id}/contents`)
      .set('Authorization', `Bearer ${recipient.accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/data-rooms/${room.id}/folders`)
      .set('Authorization', `Bearer ${recipient.accessToken}`)
      .send({ name: 'Must not be created' })
      .expect(403);
  });

  it('should deny a recipient after the owner revokes a folder share', async () => {
    const room = await createDataRoom(owner, 'Revocation room');
    const legal = await createFolder(owner, room.id, 'Legal');
    const share = await request(app.getHttpServer())
      .post('/shares')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ resourceType: 'FOLDER', resourceId: legal.id, shareType: 'USER', granteeEmail: recipient.email })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/shares/${share.body.share.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(204);
    await request(app.getHttpServer())
      .get(`/folders/${legal.id}/contents`)
      .set('Authorization', `Bearer ${recipient.accessToken}`)
      .expect(403);
  });

  it('should expose only a public folder subtree and keep error codes out of production responses', async () => {
    const room = await createDataRoom(owner, 'Public link room');
    const legal = await createFolder(owner, room.id, 'Legal');
    const contracts = await createFolder(owner, room.id, 'Contracts', legal.id);
    const financials = await createFolder(owner, room.id, 'Financials');
    const share = await request(app.getHttpServer())
      .post('/shares')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ resourceType: 'FOLDER', resourceId: legal.id, shareType: 'PUBLIC' })
      .expect(201);

    const publicContents = await request(app.getHttpServer())
      .get(`/public-shares/${share.body.publicToken}/contents`)
      .expect(200);
    expect(publicContents.body.folders).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: contracts.id, name: contracts.name })]),
    );

    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const denied = await request(app.getHttpServer())
        .get(`/public-shares/${share.body.publicToken}/folders/${financials.id}/contents`)
        .expect(403);
      expect(denied.body).toMatchObject({ statusCode: 403, message: 'You do not have access to this item.' });
      expect(denied.body).not.toHaveProperty('errorCode');
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('should report recursive deletion counts and make the deleted subtree unavailable', async () => {
    const room = await createDataRoom(owner, 'Deletion room');
    const legal = await createFolder(owner, room.id, 'Legal');
    const contracts = await createFolder(owner, room.id, 'Contracts', legal.id);

    const summary = await request(app.getHttpServer())
      .get(`/folders/${legal.id}/deletion-summary`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);
    expect(summary.body).toEqual({ folderCount: 2, fileCount: 0, sizeBytes: '0' });

    await request(app.getHttpServer())
      .delete(`/folders/${legal.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(204);
    await request(app.getHttpServer())
      .get(`/folders/${contracts.id}/contents`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(404);
  });

  it('should upload same-name PDFs without overwriting the existing file', async () => {
    const room = await createDataRoom(owner, 'Upload room');
    const firstFile = await uploadPdf(owner, room.id, 'report.pdf');
    const secondFile = await uploadPdf(owner, room.id, 'report.pdf');

    expect(firstFile.name).toBe('report.pdf');
    expect(secondFile.name).toBe('report (1).pdf');
  });

  async function createDataRoom(user: TestUser, name: string): Promise<DataRoomResponse> {
    const response = await request(app.getHttpServer())
      .post('/data-rooms')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: `${testRunId} ${name}` })
      .expect(201);
    return response.body;
  }

  async function createFolder(
    user: TestUser,
    dataRoomId: string,
    name: string,
    parentId?: string,
  ): Promise<FolderResponse> {
    const response = await request(app.getHttpServer())
      .post(`/data-rooms/${dataRoomId}/folders`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name, parentId })
      .expect(201);
    return response.body;
  }

  async function uploadPdf(user: TestUser, dataRoomId: string, fileName: string) {
    const intent = await request(app.getHttpServer())
      .post('/files/upload-intents')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ dataRoomId, fileName, mimeType: 'application/pdf', sizeBytes: PDF_CONTENT.length })
      .expect(201);
    const uploadIntent = intent.body as UploadIntentResponse;
    storageKeys.push(uploadIntent.storageKey);

    const upload = await supabase.storage
      .from(process.env.SUPABASE_STORAGE_BUCKET!)
      .uploadToSignedUrl(uploadIntent.storageKey, uploadIntent.token, PDF_CONTENT, {
        contentType: 'application/pdf',
      });
    expect(upload.error).toBeNull();

    const completed = await request(app.getHttpServer())
      .post('/files/complete')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        dataRoomId,
        fileName,
        mimeType: 'application/pdf',
        sizeBytes: PDF_CONTENT.length,
        storageKey: uploadIntent.storageKey,
      })
      .expect(201);
    return completed.body as { id: string; name: string };
  }
});

function loadEnvironmentFile(): void {
  const environmentPath = resolve(__dirname, '..', '.env');
  for (const line of readFileSync(environmentPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !match[1].startsWith('#')) {
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  }
}

async function createUser(supabase: SupabaseClient, role: string): Promise<TestUser> {
  const email = `${testRunId}-${role}@example.test`;
  const password = `Aqa-${testRunId}-Password!`;
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    throw new Error(`Could not create ${role} test user: ${createError?.message ?? 'unknown error'}`);
  }

  const { data: signedIn, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError || !signedIn.session) {
    throw new Error(`Could not sign in ${role} test user: ${signInError?.message ?? 'unknown error'}`);
  }

  return { id: created.user.id, email, accessToken: signedIn.session.access_token };
}
