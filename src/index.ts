import { getAsyncLifecycle, defineConfigSchema } from '@openmrs/esm-framework';
import { configSchema } from './config-schema';
import { moduleName } from './constants';

const options = {
  featureName: 'smart-app-launch',
  moduleName,
};

export const importTranslation = require.context('../translations', false, /.json$/, 'lazy');

export function startupApp() {
  defineConfigSchema(moduleName, configSchema);
}

// Root component
export const root = getAsyncLifecycle(() => import('./root.component'), options);

// Extensions

// The way a clinician starts a SMART app for the patient in front of them. In the patient action menu
// rather than as a chart tab: it is an action taken about a patient, not a view of them.
export const launchAppAction = getAsyncLifecycle(() => import('./launch-app.extension'), options);

// Modals

export const smartAppsModal = getAsyncLifecycle(() => import('./smart-apps.modal'), options);

// A launched app, framed over the chart rather than replacing it. Separate from the picker so the list
// closes as the app opens: two stacked dialogs would leave the clinician looking at a list they have
// already used.
export const smartAppFrameModal = getAsyncLifecycle(() => import('./smart-app-frame.modal'), options);
