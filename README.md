# @openmrs/esm-smart-app-launch-app

smart-app-launch frontend module for O3

## Quick start

```bash
yarn install
yarn start
```

Once started, your module will be available at:
**http://localhost:8080/openmrs/spa/smart/select-patient**

## What's included

- ✅ OpenMRS 3.0 microfrontend setup
- ✅ Carbon Design System integration
- ✅ Internationalization (i18n) ready
- ✅ TypeScript configuration
- ✅ Vitest testing setup
- ✅ ESLint + Prettier

## Learn more

### OpenMRS O3 resources

- [Getting Started](https://o3-docs.openmrs.org/docs/getting-started) - Start here for O3 development
- [Creating a Frontend Module](https://o3-docs.openmrs.org/docs/frontend-modules/creating-a-frontend-module) - Step-by-step guide
- [Framework Concepts](https://o3-docs.openmrs.org/docs/framework-concepts) - Core O3 patterns

### Development guide

- [Extension System](https://o3-docs.openmrs.org/docs/extension-system) - Adding widgets and extensions
- [State Management](https://o3-docs.openmrs.org/docs/state-management) - Managing app state
- [Carbon and Styling](https://o3-docs.openmrs.org/docs/carbon-and-styling) - UI components and styling
- [Testing](https://o3-docs.openmrs.org/docs/testing) - Testing your module

### Community

- [OpenMRS Talk](https://talk.openmrs.org/) - Community forum for questions
- [OpenMRS Wiki](https://wiki.openmrs.org/display/RES/OpenMRS+3.x+Dev+Forum) - Join the developer community

## Common tasks

### Adding new routes

See the [Routing Guide](https://o3-docs.openmrs.org/docs/frontend-modules/routing) for details.



### Development commands

```bash
# Start development server
yarn start

# Build for production
yarn build

# Run tests
yarn test

# Watch tests
yarn test:watch

# Run the browser tests (needs a running stack; see below)
yarn test:e2e

# Extract translations
yarn extract-translations

# Type checking
yarn typescript

# Linting
yarn lint

# Format code
yarn prettier
```

### Setting up source path aliases

If you want `@hooks/*`-style imports, three configs must agree, and the build config is the one that's easy to forget. Add matching entries to all of them:

**tsconfig.json**

```json
"paths": {
  "@hooks/*": ["./src/hooks/*"]
}
```

**vitest.config.ts** (under `test.alias`)

```ts
{ find: /^@hooks\/(.*)$/, replacement: r('./src/hooks/') + '$1' },
```

**rspack.config.js** (merged into the exported config)

```js
const path = require('path');

// ...
resolve: {
  alias: {
    '@hooks': path.resolve(__dirname, 'src/hooks/'),
  },
},
```

Without the build config entry, aliased imports pass type checking and tests but fail `yarn build`. See [openmrs-esm-form-builder](https://github.com/openmrs/openmrs-esm-form-builder) for a working example.

### Enforcing coverage thresholds

`yarn coverage` reports coverage without failing the build. To enforce minimums once your test suite has grown into them, add thresholds to the `coverage` block in `vitest.config.ts`:

```ts
coverage: {
  // ...
  thresholds: {
    statements: 80,
    branches: 80,
    functions: 80,
    lines: 80,
  },
},
```

## Installation

```bash
yarn add @openmrs/esm-smart-app-launch-app
```

## Usage

[Add usage instructions here]

## Building

```bash
yarn build
```

## Testing

```bash
yarn test
```

## Troubleshooting

### `openmrs develop` crashes with `Cannot read properties of undefined (reading 'devServer')`

Ensure your build config re-exports the default OpenMRS config, for example:

```js
module.exports = require('openmrs/default-rspack-config');
```

### Yarn peer dependency warnings (dayjs, i18next, single-spa, swr, react-is, sass)

If you see missing peer dependency warnings, add the missing packages to your `devDependencies` at the versions the warnings name, then re-run `yarn install`.

---

This module was scaffolded with [`@openmrs/create-o3-app`](https://github.com/openmrs/create-o3-app). The `generator` field in `package.json` records the CLI version that produced it and is safe to remove.

## Browser tests

`yarn test:e2e` walks a complete SMART standalone launch in a real browser: an app is redirected to
the authorization server, the clinician signs in with their own OpenMRS credentials, picks a patient
here, and the app receives an access token carrying that patient as launch context.

They need a running stack rather than a dev server, because the launch begins at the authorization
server and ends at the frontend served by OpenMRS. Bring one up with
[openmrs-distro-smartonfhir](https://github.com/mherman22/openmrs-distro-smartonfhir), then:

```bash
yarn test:e2e
```

Point them elsewhere with `E2E_BASE_URL`, `E2E_KEYCLOAK_URL`, `E2E_USERNAME`, `E2E_PASSWORD`,
`E2E_CLIENT_ID`, `E2E_REDIRECT_URI` and `E2E_PATIENT_SEARCH`.

These exist because the flow they cover cannot be verified any other way. Driven with `curl` it
passed while being completely broken in a browser: the app shell redirects to the login page before
this screen can load, discarding the launch token, and only a real browser runs that shell.
