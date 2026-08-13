import { expect, test } from '@playwright/test';

/**
 * Where the launch action actually appears in a patient chart.
 *
 * Written because the answer could not be settled by reading configuration. The distribution's
 * config-core_demo.json adds this extension to `action-menu-patient-chart-items-slot`, and nothing
 * happened -- that slot is not rendered anywhere in the reference application 3.7.1 frontend, so the
 * addition is silently discarded. The extension's own routes.json declares `patient-actions-slot`,
 * which esm-patient-banner-app renders as the banner's Actions menu.
 *
 * Config that names a slot nobody renders fails exactly like config that was never written, so this
 * spec asserts the rendered UI rather than the configuration behind it.
 */

const OPENMRS = process.env.E2E_BASE_URL ?? 'http://localhost/openmrs';
const USERNAME = process.env.E2E_USERNAME ?? 'doctor';
const PASSWORD = process.env.E2E_PASSWORD ?? 'OpenmrsDoc123';

test('the launch action is reachable from a patient chart', async ({ page, request }) => {
  await test.step('sign in through the session endpoint', async () => {
    // The app shell renders no route without a session, so authenticate before navigating. Using
    // page.request keeps the cookie in the browser context the page itself uses -- a plain
    // `request` fixture has its own jar, which is how two assertions in this suite were once
    // vacuous.
    const response = await page.request.get(`${OPENMRS}/ws/rest/v1/session`, {
      headers: { Authorization: `Basic ${Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64')}` },
    });
    expect(response.ok(), 'could not authenticate against the session endpoint').toBeTruthy();
    expect((await response.json()).authenticated).toBe(true);
  });

  const patientUuid = await test.step('find a patient to open', async () => {
    const response = await page.request.get(`${OPENMRS}/ws/fhir2/R4/Patient?_count=1`);
    expect(response.ok(), 'could not read a patient from the FHIR API').toBeTruthy();
    const bundle = await response.json();
    const uuid = bundle?.entry?.[0]?.resource?.id;
    expect(uuid, 'the demo database has no patients to open a chart for').toBeTruthy();
    return uuid as string;
  });

  await test.step('set a session location, which the app shell demands before any route', async () => {
    // Through the API rather than the picker: the picker is a Carbon radio group whose Confirm
    // button enables asynchronously, and driving it added flake without testing anything we care
    // about here.
    const locations = await page.request.get(`${OPENMRS}/ws/rest/v1/location?limit=1`);
    expect(locations.ok(), 'could not list locations').toBeTruthy();
    const uuid = (await locations.json())?.results?.[0]?.uuid;
    expect(uuid, 'the demo database has no locations').toBeTruthy();

    const set = await page.request.post(`${OPENMRS}/ws/rest/v1/session`, {
      data: { sessionLocation: uuid },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(set.ok(), 'could not set the session location').toBeTruthy();
  });

  await test.step('open the chart', async () => {
    await page.goto(`${OPENMRS}/spa/patient/${patientUuid}/chart`);
    await expect(page, 'the chart bounced to the login page').not.toHaveURL(/\/spa\/login/);
    await expect(
      page.getByRole('button', { name: /actions/i }).first(),
      'the chart never rendered its banner; a session without a session location lands on the location picker instead',
    ).toBeVisible({ timeout: 60000 });
  });

  await test.step('the launch action is in the Actions menu', async () => {
    await page
      .getByRole('button', { name: /actions/i })
      .first()
      .click();
    // The extension's own name for itself, as the frontend module's routes.json declares it.
    await expect(
      page
        .getByRole('menuitem', { name: /launch.*app/i })
        .or(page.getByText(/launch an app/i))
        .first(),
      'the launch action did not appear in the banner Actions menu, which is the slot the extension declares',
    ).toBeVisible();
  });
});
