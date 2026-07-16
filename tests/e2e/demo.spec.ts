import { expect, test } from '@playwright/test';

const browserProblems = new WeakMap<object, string[]>();

test.beforeEach(async ({ page }) => {
  const problems: string[] = [];
  browserProblems.set(page, problems);
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') {
      problems.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) =>
    problems.push(
      `requestfailed: ${request.method()} ${request.url()} ${request.failure()?.errorText ?? 'unknown'}`,
    ),
  );
  page.on('response', (response) => {
    if (response.status() >= 400) {
      problems.push(`http ${response.status()}: ${response.request().method()} ${response.url()}`);
    }
  });
});

test.afterEach(async ({ page }) => {
  expect(browserProblems.get(page) ?? []).toEqual([]);
});

test('founder turns a vague Codex idea into an approved brief', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('vague idea');
  await page.getByRole('link', { name: /Start a clear brief/ }).click();
  await page
    .getByRole('button', { name: /New project/ })
    .first()
    .click();
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

test('Thai locale initializes the document language without a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Switch language/ }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'th');
  await expect(page.getByRole('link', { name: /เริ่มสร้างบรีฟที่ชัดเจน/ })).toBeVisible();
});

test('Notion authorization preserves Settings and completes through a separate tab', async ({
  page,
}) => {
  await page.goto('/settings');
  const disconnect = page.getByRole('button', { name: 'Disconnect' });
  if (await disconnect.isVisible()) {
    await disconnect.click();
    await expect(page.getByRole('button', { name: /Connect Notion/ })).toBeVisible();
  }
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: /Connect Notion/ }).click();
  const callbackTab = await popupPromise;
  const callbackProblems: string[] = [];
  callbackTab.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') {
      callbackProblems.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  callbackTab.on('pageerror', (error) => callbackProblems.push(`pageerror: ${error.message}`));
  callbackTab.on('requestfailed', (request) =>
    callbackProblems.push(
      `requestfailed: ${request.method()} ${request.url()} ${request.failure()?.errorText ?? 'unknown'}`,
    ),
  );
  await callbackTab.waitForURL(/\/notion\/callback/);
  await callbackTab.waitForEvent('close');
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  expect(callbackProblems).toEqual([]);
});
