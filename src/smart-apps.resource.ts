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
 * Starts an EHR launch.
 *
 * A whole-page navigation, not a client-side route: the server answers with a redirect to the app,
 * which is outside this application. The app is named by id — the launch URL is looked up on the
 * server, so that nothing here can decide where a clinician is sent.
 */
export function launchSmartApp(appId: string, patientUuid: string) {
  const target = new URL(`${window.openmrsBase}/ms/smartEhrLaunchServlet`, window.location.origin);
  target.searchParams.set('appId', appId);
  target.searchParams.set('patientId', patientUuid);

  window.location.assign(target.toString());
}
