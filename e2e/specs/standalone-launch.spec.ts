import { expect, test, type Page } from '@playwright/test';

const OPENMRS = process.env.E2E_BASE_URL ?? 'http://localhost/openmrs';
const KEYCLOAK = process.env.E2E_KEYCLOAK_URL ?? 'http://localhost:8180';
const REALM = process.env.E2E_REALM ?? 'openmrs';
const CLIENT_ID = process.env.E2E_CLIENT_ID ?? 'smartClient';
const REDIRECT_URI = process.env.E2E_REDIRECT_URI ?? 'http://localhost:3000/';
const USERNAME = process.env.E2E_USERNAME ?? 'doctor';
const PASSWORD = process.env.E2E_PASSWORD ?? 'OpenmrsDoc123';
const SEARCH_TERM = process.env.E2E_PATIENT_SEARCH ?? 'John';

/**
 * A fixed PKCE pair, taken from RFC 7636's own example. SMART 2.x requires S256, and a fixed pair
 * keeps the verifier below matching the challenge without generating one per run.
 */
const CODE_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const CODE_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

function authorizeUrl() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    scope: 'openid launch/patient',
    redirect_uri: REDIRECT_URI,
    aud: `${OPENMRS}/ws/fhir2/R4`,
    code_challenge: CODE_CHALLENGE,
    code_challenge_method: 'S256',
  });

  return `${KEYCLOAK}/realms/${REALM}/protocol/openid-connect/auth?${params}`;
}

/**
 * Records the two things the browser cannot show us directly: the patient handed to the launch
 * endpoint, and the redirect back to the app.
 *
 * The app's own redirect_uri has nothing listening in a test environment, so the browser cannot
 * follow that final hop — but its `Location` header carries the authorization code, and reading it
 * here is equivalent to the app receiving it.
 */
function watchHandOff(page: Page) {
  const state: { patientId?: string; appRedirect?: string } = {};

  page.on('request', (request) => {
    if (request.url().includes('/ms/smartLaunchOptionSelected')) {
      state.patientId = new URL(request.url()).searchParams.get('patientId') ?? undefined;
    }
  });

  page.on('response', (response) => {
    const location = response.headers()['location'];
    if (location?.startsWith(REDIRECT_URI)) {
      state.appRedirect = location;
    }
  });

  return state;
}

test('a standalone launch chooses a patient and returns that patient as launch context', async ({ page, request }) => {
  const errors: Array<string> = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const handOff = watchHandOff(page);

  await test.step('the authorization server asks the clinician to sign in', async () => {
    await page.goto(authorizeUrl());
    await page.locator('#username').fill(USERNAME);
    await page.locator('#password').fill(PASSWORD);
    await page.locator('input[type=submit], button[type=submit]').click();
  });

  await test.step('signing in lands on the patient picker, not the login page', async () => {
    // This is the regression the spec exists for. The picker is a frontend route, and the app shell
    // renders no route without a session: pointing the launch straight at the route sent the
    // clinician to the login page instead, discarding the launch token in the URL. The launch
    // therefore goes through the module's servlet, which establishes the session first.
    await expect(page).toHaveURL(/\/spa\/smart\/select-patient/);
    await expect(page, 'the launch was bounced to the login page').not.toHaveURL(/\/spa\/login/);

    // Encoding the redirect would put the session id in the address bar, in browser history, and in
    // any referrer the launched app sees.
    expect(page.url(), 'the session id leaked into the URL').not.toContain('jsessionid');

    // The heading only renders if the frontend module actually loaded. An unmet backend dependency
    // silently prevents that, leaving an empty page with nothing in the console.
    await expect(page.getByRole('heading', { name: /choose a patient/i })).toBeVisible();
  });

  await test.step('a search finds patients and one is chosen', async () => {
    await page.getByRole('searchbox').fill(SEARCH_TERM);

    const selectButtons = page.getByRole('button', { name: /^Select$/ });
    await expect(selectButtons.first(), `no patient matched "${SEARCH_TERM}"`).toBeVisible();
    await selectButtons.first().click();

    await expect
      .poll(() => handOff.patientId, { message: 'no patient was handed to the launch endpoint' })
      .toBeTruthy();
  });

  await test.step('the app receives an authorization code carrying that patient', async () => {
    await expect
      .poll(() => handOff.appRedirect, {
        message: 'the launch never redirected back to the app',
        timeout: 60 * 1000,
      })
      .toBeTruthy();

    const code = new URL(handOff.appRedirect!).searchParams.get('code');
    expect(code, 'no authorization code in the redirect').toBeTruthy();

    const response = await request.post(`${KEYCLOAK}/realms/${REALM}/protocol/openid-connect/token`, {
      form: {
        client_id: CLIENT_ID,
        grant_type: 'authorization_code',
        code: code!,
        redirect_uri: REDIRECT_URI,
        code_verifier: CODE_VERIFIER,
      },
    });

    expect(response.status(), 'the code could not be exchanged for a token').toBe(200);
    const granted = await response.json();

    // SMART returns launch context alongside the access token, in the token response itself rather
    // than as a claim inside the token.
    expect(granted.access_token, 'no access token was issued').toBeTruthy();
    expect(granted.patient, 'the token response carried no patient context').toBe(handOff.patientId);

    // And the token has to actually work against the FHIR API it was granted for. A launch that ends
    // with a token that cannot read its own patient is not a working launch.
    const patient = await request.get(`${OPENMRS}/ws/fhir2/R4/Patient/${granted.patient}`, {
      headers: { Authorization: `Bearer ${granted.access_token}` },
    });
    expect(patient.status(), 'the granted token cannot read the patient it was granted for').toBe(200);
  });

  await test.step('the session the launch created does not outlive it', async () => {
    // The launch signs the clinician in so they can search. That session used to survive the
    // hand-off, leaving the browser holding a fully privileged session that no visible logout would
    // obviously end -- on a shared workstation, the next person's session.
    // page.context().request shares the browser's cookie jar; the bare `request` fixture has its own,
    // so it would report an anonymous session no matter what the launch left behind.
    const session = await page.context().request.get(`${OPENMRS}/ws/rest/v1/session`);
    expect(session.status(), 'the session endpoint should still answer normally').toBe(200);
    expect((await session.json()).authenticated, 'the launch left an authenticated session behind').toBe(false);
  });

  expect(errors, 'the launch produced JavaScript errors').toEqual([]);
});

/**
 * The counterpart to ending the launch's own session: a clinician who was already working in OpenMRS
 * keeps theirs. That session predates the launch and is not the launch's to end — doing so would log
 * them out of the application they are using.
 */
test('a clinician already signed in to OpenMRS keeps their session through a launch', async ({ page }) => {
  // Establishes an ordinary session in the browser's own cookie jar, without driving the login UI.
  // It has to be the browser's jar: the launch is driven in the browser, and a session it cannot see
  // is a session it cannot preserve or destroy.
  const api = page.context().request;
  const signIn = await api.get(`${OPENMRS}/ws/rest/v1/session`, {
    headers: { Authorization: `Basic ${Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64')}` },
  });
  expect((await signIn.json()).authenticated, 'could not establish an ordinary session').toBe(true);

  // And give it a login location, which is what signing in through OpenMRS actually does. Without one
  // the frontend diverts to its location picker instead of rendering any route, and the launch never
  // arrives — an artefact of the fixture, not of the launch.
  const locations = await api.get(`${OPENMRS}/ws/rest/v1/location?limit=1`);
  const locationUuid = (await locations.json()).results?.[0]?.uuid;
  expect(locationUuid, 'no location to sign in at').toBeTruthy();
  await api.post(`${OPENMRS}/ws/rest/v1/session`, { data: { sessionLocation: locationUuid } });

  // A fresh browser context has no session with the authorization server, so the form is always shown.
  await page.goto(authorizeUrl());
  await page.locator('#username').fill(USERNAME);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('input[type=submit], button[type=submit]').click();
  await expect(page.getByRole('heading', { name: /choose a patient/i })).toBeVisible();

  await page.getByRole('searchbox').fill(SEARCH_TERM);
  const selectButtons = page.getByRole('button', { name: /^Select$/ });
  await expect(selectButtons.first()).toBeVisible();

  // The session is ended, or not, while this request is served — so wait for the request itself
  // rather than for a duration.
  const handOff = page.waitForResponse((response) => response.url().includes('/ms/smartLaunchOptionSelected'));
  await selectButtons.first().click();
  await handOff;

  const after = await api.get(`${OPENMRS}/ws/rest/v1/session`);
  const session = await after.json();
  expect(session.authenticated, 'the launch logged the clinician out of their own session').toBe(true);
  expect(session.user?.username ?? session.user?.display).toContain(USERNAME);
});
