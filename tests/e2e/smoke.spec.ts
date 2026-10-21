import { test, expect } from '@playwright/test';

test('home page loads with landmarks and a skip link', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Kyle Nel/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('contentinfo')).toBeVisible();

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
});

test('unknown pages return the branded 404', async ({ page }) => {
  const res = await page.goto('/this-page-does-not-exist');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: /come undone/ })).toBeVisible();
});

test('CV pages switch tracks and offer both PDFs', async ({ page }) => {
  await page.goto('/cv/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Kyle');
  const tracks = page.getByRole('navigation', { name: 'CV version' });
  await expect(tracks.getByRole('link', { name: 'Engineering' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await tracks.getByRole('link', { name: 'Support' }).click();
  await expect(page).toHaveURL(/\/cv\/support\/?$/);
  await expect(page.getByText(/Technical Support Lead/).first()).toBeVisible();

  for (const pdf of ['Kyle-Nel_CV_Engineering.pdf', 'Kyle-Nel_CV_Support.pdf']) {
    const res = await page.request.get(`/cv/${pdf}`);
    expect(res.ok()).toBe(true);
    expect(res.headers()['content-type']).toContain('application/pdf');
  }
});

test('/resume.json serves the raw JSON Resume', async ({ request }) => {
  const res = await request.get('/resume.json');
  expect(res.ok()).toBe(true);
  expect(res.headers()['content-type']).toContain('application/json');
  const body = await res.json();
  expect(body.basics.name).toContain('Kyle');
  expect(body.basics.phone).toBeUndefined();
});

test('main navigation works', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main' });

  await nav.getByRole('link', { name: 'About' }).click();
  await expect(page).toHaveURL(/\/about\/?$/);
  await expect(page.getByRole('heading', { level: 1, name: 'About me' })).toBeVisible();

  await nav.getByRole('link', { name: 'Contact' }).click();
  await expect(page).toHaveURL(/\/contact\/?$/);
  await expect(page.getByRole('link', { name: 'Contact' }).first()).toHaveAttribute(
    'aria-current',
    'page',
  );

  await nav.getByRole('link', { name: 'Work' }).click();
  await expect(page.locator('#work')).toBeInViewport();

  await expect(nav.getByRole('link', { name: /Writing/ })).toHaveAttribute(
    'href',
    'https://devnel.blog',
  );
});

for (const slug of ['igrow', 'woocommerce-marketplace', 'quiver-cafe', 'qs-coffee-cart']) {
  test(`case study "${slug}" renders`, async ({ page }) => {
    await page.goto('/');
    await page.locator(`a[href="/work/${slug}/"]`).click();
    await expect(page).toHaveURL(new RegExp(`/work/${slug}/?$`));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    for (const section of ['The problem', 'Constraints', 'What I built', 'Stack', 'Results']) {
      await expect(page.getByRole('heading', { level: 2, name: section })).toBeVisible();
    }
    await expect(page.getByRole('img', { name: /architecture|front end/i })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'More case studies' })).toBeVisible();
  });
}
