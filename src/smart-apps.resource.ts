import useSWR from 'swr';
import { openmrsFetch } from '@openmrs/esm-framework';

export interface SmartApp {
  id: string;
  name: string;
  description?: string;
  launchContext?: string;
}

interface SmartAppsResponse {
  apps: Array<SmartApp>;
}

/**
 * The SMART apps this server permits to be launched.
 *
 * Served by the smartonfhir module rather than the REST API, and deliberately without each app's
 * launch URL: where a launch is sent is the server's business, and a chart screen only needs a name
 * and an id to link with.
 */
export function useSmartApps() {
  const { data, error, isLoading } = useSWR<{ data: SmartAppsResponse }>('/ms/smartApps', openmrsFetch, {
    // The registry is deployment configuration; it does not change while a clinician works.
    revalidateOnFocus: false,
  });

  return {
    apps: data?.data?.apps ?? [],
    isLoading,
    error,
  };
}

/**
 * Where an EHR launch starts.
 *
 * The app is named by id and nothing more: the launch URL is looked up on the server, so that nothing
 * here can decide — or be persuaded — where a clinician is sent. The same address serves both
 * presentations, as a navigation target and as an iframe source.
 */
export function launchUrlFor(appId: string, patientUuid: string, { embedded = false } = {}) {
  const target = new URL(`${window.openmrsBase}/ms/smartEhrLaunchServlet`, window.location.origin);
  target.searchParams.set('appId', appId);
  target.searchParams.set('patientId', patientUuid);

  // Whether the chart is keeping the app inside its own chrome. The server turns this into
  // need_patient_banner in the token response: the app draws its own banner when it has the window,
  // and leaves it to the chart's patient header when it does not. Only this side knows which.
  if (embedded) {
    target.searchParams.set('embedded', 'true');
  }

  return target.toString();
}

/**
 * Starts an EHR launch by leaving the chart.
 *
 * A whole-page navigation, not a client-side route: the server answers with a redirect to the app,
 * which is outside this application.
 */
export function launchSmartApp(appId: string, patientUuid: string) {
  window.location.assign(launchUrlFor(appId, patientUuid));
}
