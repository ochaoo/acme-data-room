# Data Room overview

## Overview

The application has a Next.js browser client and a NestJS API. Supabase provides user identity, PostgreSQL, and a private object bucket. The API is the only component that makes authorization decisions or uses the Storage service role.

## Files

- `apps/web/app/page.tsx` — session-aware entry point.
- `apps/web/components/data-room-workspace.tsx` — authenticated room browser, upload, file and folder actions.
- `apps/web/components/share-dialog.tsx` — creation and revocation of user and public shares.
- `apps/web/app/share/[token]/page.tsx` — public, read-only shared-content view.
- `apps/api/prisma/schema.prisma` — metadata model and indexes.
- `apps/api/src/modules/auth` — Supabase token verification and local user provisioning.
- `apps/api/src/modules/folders`, `files`, and `sharing` — folder tree, document lifecycle, and access scopes.
- `apps/api/test/data-room.e2e-spec.ts` — live integration coverage with cleanup.

## Flow

1. The browser signs in with Supabase Auth and sends the access token as a Bearer token to the API.
2. The auth guard validates the token with Supabase, then upserts the local user profile.
3. Owners create rooms and nested folders. Folder contents return breadcrumbs plus independently paged folder and file streams.
4. For an upload, the owner requests a signed storage upload URL, uploads to the private bucket from the browser, and calls the completion endpoint. The API checks that the expected object exists before creating metadata.
5. A share is either tied to an existing user or represented by a randomly generated public token. Only its hash is stored. Access control resolves direct and inherited room/folder scopes and rejects write operations for recipients.
6. Deleting a folder obtains its descendant tree, warns the owner in the UI, removes objects and descendant share records, then deletes the subtree.

## Configuration

Use `apps/api/.env.example` and `apps/web/.env.example` as the only configuration templates. Keep the API service-role key server-side. The browser needs only the Supabase URL, anon key, and API origin. The Storage bucket must be private.

## Usage

Run the API build and the web build from the repository root, then run `npm run test:e2e --workspace=@acme/data-room-api` to verify core flows. See the root README for the exact setup and deployment commands.

## Notes

- Permissioned sharing requires a user who has already registered through Supabase Auth; no invitation email flow exists yet.
- PDF files are limited to 50 MB in this MVP.
- `EDITOR` is represented in the data model for forward compatibility but not enabled by the current authorization/UI flow.
- Public links are revocable but do not expire or require a password.
