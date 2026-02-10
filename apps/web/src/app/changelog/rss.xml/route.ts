import { NextResponse } from 'next/server';

import { CHANGELOG } from '@/lib/changelog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function slugifyVersion(version: string): string {
  return version.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function GET() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') ?? 'https://synac.example';
  const now = new Date();

  const items = CHANGELOG.slice(0, 50)
    .map((entry) => {
      const id = `v-${slugifyVersion(entry.version)}`;
      const link = `${siteUrl}/changelog#${id}`;
      const pubDate = new Date(`${entry.date}T00:00:00.000Z`).toUTCString();
      const description = [
        entry.title,
        ...entry.sections.flatMap((section) => {
          if (section.items.length === 0) return [];
          return ['', `${section.title}:`, ...section.items.map((item) => `- ${item}`)];
        }),
      ].join('\n');

      return [
        '<item>',
        `<title>${escapeXml(`SynAc ${entry.version} — ${entry.title}`)}</title>`,
        `<link>${escapeXml(link)}</link>`,
        `<guid>${escapeXml(link)}</guid>`,
        `<pubDate>${escapeXml(pubDate)}</pubDate>`,
        `<description>${escapeXml(description)}</description>`,
        '</item>',
      ].join('');
    })
    .join('');

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '<channel>',
    `<title>${escapeXml('SynAc Changelog')}</title>`,
    `<link>${escapeXml(`${siteUrl}/changelog`)}</link>`,
    `<description>${escapeXml('Versioned changes to SynAc.')}</description>`,
    `<lastBuildDate>${escapeXml(now.toUTCString())}</lastBuildDate>`,
    '<language>en</language>',
    items,
    '</channel>',
    '</rss>',
  ].join('');

  return new NextResponse(xml, {
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      'cache-control': 'public, max-age=60',
    },
  });
}
