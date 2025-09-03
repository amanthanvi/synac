import { test, expect } from '@playwright/test';

test.describe('JSON-LD shape for foundation terms', () => {
  const slugs = ['jwt', 'oauth2', 'aead', 'rsa', 'dns'];

  for (const id of slugs) {
    test(`serves JSON-LD for /terms/${id}.jsonld and references it from the page`, async ({
      request,
      page,
    }) => {
      const res = await request.get(`/terms/${id}.jsonld`);
      expect(res.ok(), `/terms/${id}.jsonld should return 200`).toBeTruthy();
      expect(res.headers()['content-type']).toContain('application/ld+json');
      const body = await res.json();
      expect(body['@context']).toBeTruthy();
      expect(body['@type']).toBe('DefinedTerm');
      expect(typeof body.name).toBe('string');
      expect(typeof body.url).toBe('string');

      await page.goto(`/terms/${id}`);
      const script = page.locator(`script[type="application/ld+json"][src="/terms/${id}.jsonld"]`);
      await expect(script).toHaveCount(1);
    });
  }
});
