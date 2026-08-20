import { expect, test, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Captures the screenshots for the EHR launch walkthrough in openmrs-distro-smartonfhir.
 *
 * This is a capture script rather than a test: it drives the launch the way a clinician does and
 * photographs each step, so the documentation shows the real UI instead of prose describing it. It
 * still asserts at every step, because a walkthrough illustrated with screenshots of a broken flow
 * is worse than no walkthrough.
 *
 * Run it against a running stack:
 *   docker compose up -d                     # in openmrs-distro-smartonfhir, which pulls the SMART app
 *   npx playwright test --config e2e/playwright.config.ts capture-walkthrough
 */

const OPENMRS = process.env.E2E_BASE_URL ?? 'http://localhost/openmrs';
const USERNAME = process.env.E2E_USERNAME ?? 'doctor';
const PASSWORD = process.env.E2E_PASSWORD ?? 'Doctor123';
const APP = process.env.E2E_APP_URL ?? 'http://localhost:3000';
const SHOTS =
  process.env.E2E_SCREENSHOT_DIR ?? path.resolve(__dirname, '../../../openmrs-distro-smartonfhir/docs/images');

let step = 0;
const chain: string[] = [];
async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS, { recursive: true });
  step += 1;
  const file = path.join(SHOTS, `${String(step).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.warn(`  captured ${path.basename(file)}`);
}

test('capture the EHR launch, end to end', async ({ page }) => {
  test.setTimeout(4 * 60 * 1000);

  await test.step('the OpenMRS login page', async () => {
    await page.goto(`${OPENMRS}/spa/login`);
    await expect(page.getByLabel(/username/i)).toBeVisible();
    await shot(page, 'login');
  });

  await test.step('sign in as a clinician', async () => {
    await page.getByLabel(/username/i).fill(USERNAME);
    await page.getByRole('button', { name: /continue/i }).click();
    await page.locator('input[type="password"]').fill(PASSWORD);
    await shot(page, 'password');
    await page.getByRole('button', { name: /log in/i }).click();
  });

  await test.step('choose a login location', async () => {
    const location = page.locator('.cds--radio-button-group .cds--radio-button__label').first();
    await expect(location, 'the login did not reach the location picker').toBeVisible({ timeout: 60000 });
    await shot(page, 'location');
    // The label, not the input. Carbon renders the real radio visually hidden behind a styled label, so
    // a role-based query finds an element that is never visible and the step reads as "the location
    // picker never appeared". Taking the first label also keeps this independent of the location names,
    // which differ per deployment.
    await location.click();
    await page.getByRole('button', { name: /confirm/i }).click();
    await expect(page).not.toHaveURL(/\/spa\/login/, { timeout: 60000 });
  });

  const patientUuid = await test.step('pick a patient from the demo data', async () => {
    const response = await page.request.get(`${OPENMRS}/ws/fhir2/R4/Patient?_count=1`);
    expect(response.ok(), 'could not read a patient from the FHIR API').toBeTruthy();
    const uuid = (await response.json())?.entry?.[0]?.resource?.id;
    expect(uuid, 'the demo database has no patients').toBeTruthy();
    return uuid as string;
  });

  await test.step('open the patient chart', async () => {
    await page.goto(`${OPENMRS}/spa/patient/${patientUuid}/chart`);
    await expect(page.getByRole('button', { name: /actions/i }).first()).toBeVisible({ timeout: 60000 });
    await shot(page, 'patient-chart');
  });

  await test.step('the Actions menu carries the launch action', async () => {
    await page
      .getByRole('button', { name: /actions/i })
      .first()
      .click();
    await expect(page.getByText(/launch an app/i).first()).toBeVisible();
    await shot(page, 'actions-menu');
  });

  await test.step('the app picker', async () => {
    await page
      .getByText(/launch an app/i)
      .first()
      .click();
    await expect(page.getByRole('button', { name: /^launch$/i }).first()).toBeVisible({ timeout: 30000 });
    await shot(page, 'app-picker');
  });

  const launched = await test.step('launch, and follow where it goes', async () => {
    // The authorization server step is a redirect chain with no page a clinician ever sees, so the
    // evidence for it is the sequence of URLs rather than a screenshot. Recorded across the whole
    // context, because the launch may open a second tab.
    // Responses, not navigations: the hops between OpenMRS, the app and Keycloak are server-side
    // 302s, and the browser commits the whole chain as a single document navigation -- recording
    // navigations showed exactly one URL, the last one.
    const record = (p: Page) =>
      p.on('response', (response) => {
        const status = response.status();
        const isDocument = response.request().resourceType() === 'document';
        if (isDocument && (status >= 300 || status === 200)) {
          chain.push(`${status} ${response.url()}`);
        }
      });
    record(page);
    page.context().on('page', record);

    // The launch may open the app in a new tab; take whichever page ends up carrying it.
    const popup = page.waitForEvent('popup', { timeout: 15000 }).catch(() => null);
    await page
      .getByRole('button', { name: /^launch$/i })
      .first()
      .click();
    const opened = await popup;
    const target = opened ?? page;
    await target.waitForLoadState('domcontentloaded');
    return target;
  });

  await test.step('the authorization server, then the app', async () => {
    // No screenshot of the authorization server: in an EHR launch it authorizes the clinician
    // without showing anything, which is the whole point of the flow. An earlier version of this
    // script photographed "Keycloak" here and captured the app's own page instead.
    const consent = launched.getByRole('button', { name: /allow|authorize|yes|continue/i }).first();
    // Conditional on purpose: whether the authorization server shows anything is what this step is
    // documenting, and a realm that adds a consent screen must not break the capture.
    // eslint-disable-next-line playwright/no-conditional-in-test
    if (await consent.isVisible({ timeout: 3000 }).catch(() => false)) {
      await shot(launched, 'authorization-server');
      await consent.click();
    }

    await launched.waitForURL((url) => url.toString().startsWith(APP), { timeout: 90000 });
    // The app reads the record before it can render anything, so wait for its verdict rather than for
    // the page load: a screenshot taken earlier catches a spinner.
    await expect(launched.locator('.banner h2'), 'the app never reached a verdict').toBeVisible({ timeout: 60000 });
    await shot(launched, 'app-received-the-patient');

    // The point of the whole flow, and of this app: it is not showing the record back, it is reading
    // it. The banner counts vitals outside their reference range, and the BMI card holds a value the
    // server does not store.
    await expect(launched.locator('.banner h2')).toContainText(/of \d+ latest vitals/i);
    await expect(launched.locator('svg.chart').first(), 'no vitals were trended').toBeVisible();

    // Scroll to the derived card before photographing it. Without this the shot is taken at the same
    // offset as the one above and the two files come out byte-identical, so the walkthrough illustrated
    // "the value the server does not store" with a picture that did not contain it.
    const derived = launched.locator('.card:has(.derived)').first();
    await derived.scrollIntoViewIfNeeded();
    await expect(derived.locator('.big'), 'no BMI was derived').toBeVisible();
    await expect(derived.locator('.cat')).toContainText(/weight|obese/i);
    await shot(launched, 'derived-values');
  });

  await test.step('write the redirect chain the documentation quotes', async () => {
    const seen = chain.filter((u, i) => u !== 'about:blank' && u !== chain[i - 1]);

    // The chain carries live credentials -- a signed app token, an authorization code, Keycloak
    // session codes -- and it gets committed as documentation. Keep the shape, drop the values.
    const redacted = seen.map((line) =>
      line
        .replace(
          // Not the literal {APP_TOKEN} placeholder: that is the authorization server handing the
          // module a slot to fill, and it is the most informative part of this hop.
          /(app-token%3D|app-token=)(?!%7BAPP_TOKEN%7D|\{APP_TOKEN\})(?:(?!%26)[^&\s])+/g,
          '$1<signed launch token>',
        )
        .replace(/(launch=)[^&\s]+/g, '$1<launch handle>')
        .replace(/([?&]code=)[^&\s]+/g, '$1<authorization code>')
        .replace(/(session_code%3D|session_code=)(?:(?!%26)[^&\s])+/g, '$1<session code>')
        .replace(/(session_state=)[^&\s]+/g, '$1<session state>')
        .replace(/([?&]state=)[^&\s]+/g, '$1<state>')
        .replace(/(code_challenge=)[^&\s]+/g, '$1<PKCE challenge>')
        .replace(/(client_data%3D|client_data=)(?:(?!%26)[^&\s])+/g, '$1<client data>')
        .replace(/(tab_id%3D|tab_id=)(?:(?!%26)[^&\s])+/g, '$1<tab id>')
        // Per-import, so leaving it in rewrote this file every time the realm was imported and made
        // the diff look like the flow had changed when nothing had.
        .replace(/(execution%3D|execution=)(?:(?!%26)[^&\s])+/g, '$1<execution>'),
    );
    fs.writeFileSync(path.join(SHOTS, '..', 'launch-redirects.txt'), redacted.join('\n') + '\n');
    console.warn(`  recorded ${seen.length} navigations`);
  });
});
