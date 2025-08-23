import { z } from 'zod';

export const SourceKind = z.enum(['NIST', 'RFC', 'ATTACK', 'CWE', 'CAPEC', 'OTHER']);

export const termSchema = z.object({
  id: z.string(), // slug (should match file slug)
  term: z.string(),
  acronym: z.array(z.string()).optional(),
  aliases: z.array(z.string()).optional(),
  summary: z.string(),
  tags: z.array(z.string()),
  sources: z.array(
    z.object({
      kind: SourceKind,
      citation: z.string(),
      url: z.string().url(),
      date: z.string().optional(),
      excerpt: z.string().optional(),
      normative: z.boolean().optional(),
    }),
  ),
  mappings: z
    .object({
      attack: z
        .object({
          tactic: z.string().optional(),
          techniqueIds: z.array(z.string()).optional(),
        })
        .optional(),
      cweIds: z.array(z.string()).optional(),
      capecIds: z.array(z.string()).optional(),
      examDomains: z.array(z.string()).optional(),
    })
    .optional(),
  examples: z
    .array(
      z.object({
        heading: z.string(),
        body: z.string(),
      }),
    )
    .optional(),
  seeAlso: z.array(z.string()).optional(),
  oftenConfusedWith: z.array(z.string()).optional(),
  updatedAt: z.string().datetime(), // ISO
});

export type Term = z.infer<typeof termSchema>;
