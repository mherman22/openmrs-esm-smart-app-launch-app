import { expect, test } from '@playwright/test';

/**
 * Signing out of a launched application and starting again, which is a standalone launch reached from
 * the one place a clinician actually reaches it from.
 *
 * Written for a report that this ended on a page which never rendered, with
 * `application '@uwdigi/esm-smart-app-launch-app-page-0' died in status LOADING_SOURCE_CODE:
 * __webpack_modules__[e] is undefined`. It did not reproduce here, and would not: a test context has no
 * cache, and that error was a chunk cached from an earlier build being served beside a current entry
 * file. The chunks are content-addressed now, so the URL changes when the contents do.
 *
 * The test stays because nothing else covered this path. The standalone spec starts at an authorize URL;
 * this starts where a clinician starts, in the application, after signing out of it -- and it asserts
 * the picker rendered rather than that the URL was reached, which is the difference between a page and
 * a page that loaded its source.
 */

const OPENMRS = process.env.E2E_BASE_URL ?? 'http://localhost/openmrs';
const USERNAME = process.env.E2E_USERNAME ?? 'doctor';
const PASSWORD = process.env.E2E_PASSWORD ?? 'Doctor123';
const APP = process.env.E2E_APP_URL ?? 'http://localhost:3000';

test('signing out of the application and back in reaches a rendered page', async ({ page }) => {
  test.setTimeout(4 * 60 * 1000);

  const failures: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      failures.push(message.text());
    }
  });
  page.on('pageerror', (error) => failures.push(error.message));
  const notFound: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 400 && /\.js(\?|$)/.test(response.url())) {
      notFound.push(`${response.status()} ${response.url()}`);
    }
  });

  await test.step('sign in and launch the application from a chart', async () => {
    await page.goto(`${OPENMRS}/spa/login`);
    await page.getByLabel(/username/i).fill(USERNAME);
    await page.getByRole('button', { name: /continue/i }).click();
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole('button', { name: /log in/i }).click();

    const location = page.locator('.cds--radio-button-group .cds--radio-button__label').first();
    await expect(location, 'the login did not reach the location picker').toBeVisible({ timeout: 60000 });
    await location.click();
    await page.getByRole('button', { name: /confirm/i }).click();
    await expect(page).not.toHaveURL(/\/spa\/login/, { timeout: 60000 });

    const response = await page.request.get(`${OPENMRS}/ws/fhir2/R4/Patient?_count=1`);
    const patientUuid = (await response.json())?.entry?.[0]?.resource?.id;
    expect(patientUuid, 'the demo database has no patients').toBeTruthy();

    await page.goto(`${OPENMRS}/spa/patient/${patientUuid}/chart`);
    await page
      .getByRole('button', { name: /actions/i })
      .first()
      .click();
    await page
      .getByText(/launch an app/i)
      .first()
      .click();

    const popup = page.waitForEvent('popup', { timeout: 15000 }).catch(() => null);
    await page
      .getByRole('button', { name: /^launch$/i })
      .first()
      .click();
    const opened = await popup;
    const target = opened ?? page;
    await target.waitForURL((url) => url.toString().startsWith(APP), { timeout: 90000 });
    await expect(target.locator('.banner h2')).toContainText(/of \d+ latest vitals/i, { timeout: 60000 });
  });

  await test.step('sign out, then sign in again', async () => {
    const app =
      page
        .context()
        .pages()
        .find((p) => p.url().startsWith(APP)) ?? page;

    await app
      .getByRole('button', { name: /sign out/i })
      .first()
      .click();
    await app.waitForLoadState('domcontentloaded');
    console.warn(`  after sign out: ${new URL(app.url()).pathname}`);

    // Whatever the application offers to get back in. Not conditional: an earlier version of this
    // step skipped past every stage it could not find and still passed, having reached nothing.
    await app
      .getByRole('button', { name: /sign in|log in|launch/i })
      .first()
      .click();

    // Keycloak's own form, which is what a standalone launch shows and an EHR launch never does.
    await app.waitForURL(/openid-connect\/auth|login-actions/, { timeout: 60000 });
    await app.locator('#username').fill(USERNAME);
    await app.locator('#password').fill(PASSWORD);
    await app.locator('input[type=submit], button[type=submit]').click();

    // The reported failure is here: the picker route is the one place the page-0 chunk loads.
    await app.waitForURL(/\/spa\/smart\/select-patient/, { timeout: 90000 });
    await expect(
      app.getByRole('heading', { name: /choose a patient/i }),
      'the patient picker never rendered',
    ).toBeVisible({ timeout: 60000 });
    // The path only. This URL carries Keycloak's action token, which is a single-use credential, and
    // this output is a CI log.
    console.warn(`  after signing in again: ${new URL(app.url()).pathname}`);
    console.warn(`  console errors: ${failures.length ? failures.join(' | ') : 'none'}`);
    console.warn(`  failed script requests: ${notFound.length ? notFound.join(' | ') : 'none'}`);

    // The reported failure: the picker route loads no source code and renders nothing.
    expect(
      failures.filter((f) => /LOADING_SOURCE_CODE|__webpack_modules__/.test(f)),
      'the frontend module failed to load its source',
    ).toEqual([]);
  });
});
