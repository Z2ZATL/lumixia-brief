import { expect, test } from '@playwright/test';

test('founder turns a vague Codex idea into an approved brief', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('vague idea');
  await page.getByRole('link', { name: /Start a clear brief/ }).click();
  await page.getByRole('button', { name: /New project/ }).click();
  await page.getByLabel('Project name').fill('Founder preparing a brief for Codex');
  await page
    .getByLabel('Rough idea')
    .fill('I want Codex to build a product launch workspace, but the scope is still vague.');
  await page.getByRole('button', { name: /Create and begin interview/ }).click();

  for (let index = 0; index < 6; index += 1) {
    await page
      .getByLabel('Your answer')
      .fill(
        `Decision-ready answer ${index + 1} with a specific user, boundary, result, and observable detail for the team.`,
      );
    await page.getByRole('button', { name: /Save answer/ }).click();
  }
  await page
    .getByRole('button', { name: /Generate structured brief/ })
    .first()
    .click();
  await expect(page.getByText('Alignment Improvement')).toBeVisible();
  await page.getByRole('button', { name: /Approve snapshot/ }).click();
  await expect(page.getByText('Approved', { exact: true }).first()).toBeVisible();
});

test('landing and app remain usable at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Start a clear brief/ })).toBeVisible();
  await page.getByRole('link', { name: /Start a clear brief/ }).click();
  await expect(page.getByRole('button', { name: /New project/ })).toBeVisible();
});
