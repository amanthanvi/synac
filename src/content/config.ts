import { defineCollection } from 'astro:content';
import { termSchema } from './schema';

const terms = defineCollection({
  type: 'content',
  schema: termSchema,
});

export const collections = {
  terms,
};
