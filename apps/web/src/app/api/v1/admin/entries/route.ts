import { NextResponse } from 'next/server';

import { requireAdminActor } from '@/lib/admin';
import { createDraftEntry } from '@/lib/adminEntries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === 'string' ? value : '';
}

function parseEntryType(value: string): 'TERM' | 'ACRONYM' {
  const v = value.toUpperCase();
  return v === 'ACRONYM' ? 'ACRONYM' : 'TERM';
}

export async function POST(request: Request) {
  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN') && !actor.roleNames.includes('EDITOR')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = (await request.json()) as unknown;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const data = body as Record<string, unknown>;
  const entryType = parseEntryType(getString(data, 'entryType'));

  const { entryId } = await createDraftEntry({
    actorUserId: actor.dbUserId,
    entryType,
    displayTitle: getString(data, 'displayTitle'),
    primarySlug: getString(data, 'primarySlug') || undefined,
  });

  return NextResponse.json({ entryId });
}

