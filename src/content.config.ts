import { glob } from 'astro/loaders';
import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';

const blog = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: './src/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.date(),
    updatedDate: z.date().optional(),
    author: z.string().default('AI Revenue Blog'),
    category: z.string(),
    tags: z.array(z.string()),
    image: z
      .object({
        url: z.string(),
        alt: z.string(),
      })
      .optional(),
    coupangLinks: z
      .array(
        z.object({
          title: z.string(),
          url: z.string(),
          imageUrl: z.string().optional(),
        })
      )
      .optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
