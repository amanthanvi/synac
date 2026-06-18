'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import styles from './TagDirectory.module.css';
import tagStyles from '@/app/_styles/Tags.module.css';

export type TagDirectoryItem = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  count: number;
  countIsApproximate?: boolean;
};

export function TagDirectory({ tags }: { tags: TagDirectoryItem[] }) {
  const [value, setValue] = useState('');
  const trimmed = value.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!trimmed) return tags;
    return tags.filter((tag) => {
      const haystack = `${tag.name} ${tag.slug} ${tag.description ?? ''}`.toLowerCase();
      return haystack.includes(trimmed);
    });
  }, [tags, trimmed]);

  return (
    <section className={styles.wrap} aria-label="Tag directory">
      <div className={styles.controls}>
        <label className="srOnly" htmlFor="tag-filter">
          Filter tags
        </label>
        <input
          id="tag-filter"
          className={styles.search}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Filter tags…"
          autoComplete="off"
          spellCheck="false"
        />
      </div>

      {filtered.length === 0 ? (
        <div className={tagStyles.empty}>No matching tags.</div>
      ) : (
        <ol className={tagStyles.list}>
          {filtered.map((tag) => (
            <li key={tag.id} className={tagStyles.item}>
              <div className={tagStyles.itemTitleRow}>
                <Link className={tagStyles.itemTitle} href={`/tags/${tag.slug}`}>
                  {tag.name}
                </Link>
                <span className={tagStyles.itemSlug}>
                  {tag.count.toLocaleString()}
                  {tag.countIsApproximate ? '+' : ''} entries
                </span>
              </div>
              {tag.description ? <p className={tagStyles.itemDesc}>{tag.description}</p> : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
