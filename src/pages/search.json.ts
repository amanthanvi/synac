import MiniSearch from "minisearch";
import { getCollection } from "astro:content";

export const prerender = true;

type Doc = {
  id: string;
  term: string;
  acronym?: string[];
  aliases?: string[];
  text: string;
  tags: string[];
  sourceKinds: string[];
};

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

export async function GET() {
  const entries = await getCollection("terms");

  const docs: Doc[] = entries.map((e) => {
    const data = e.data as any;
    const sourceKinds = unique<string>(
      (data.sources || []).map((s: any) => String(s.kind || "OTHER"))
    );
    return {
      id: e.slug,
      term: data.term,
      acronym: data.acronym,
      aliases: data.aliases,
      text: [
        data.summary,
        ...(data.sources || []).map(
          (s: any) => `${s.citation || ""} ${s.excerpt || ""}`
        ),
      ]
        .filter(Boolean)
        .join(" "),
      tags: data.tags || [],
      sourceKinds,
    };
  });

  const options = {
    idField: "id",
    fields: ["term", "acronym", "aliases", "text", "tags", "sourceKinds"],
    storeFields: ["id", "term", "acronym", "aliases", "tags", "sourceKinds"],
    searchOptions: {
      prefix: true,
      fuzzy: 0.2,
      boost: { term: 2, acronym: 2, aliases: 1.5 },
    },
  } as const;

  const mini = new MiniSearch(options as any);
  mini.addAll(docs);

  const payload = {
    options,
    index: mini.toJSON(), // client will revive via MiniSearch.fromJSON
    // Keep docs for potential debugging or alternative client strategies (optional)
    // docs,
  };

  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
