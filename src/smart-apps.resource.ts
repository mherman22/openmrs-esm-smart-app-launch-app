import useSWR from 'swr';
import { openmrsFetch } from '@openmrs/esm-framework';

export interface SmartApp {
  uuid: string;
  display: string;
  description?: string;
  launchContext?: string;
}

interface SmartAppsResponse {
  results: Array<SmartApp>;
}

/**
 * The SMART apps this server permits to be launched.
 *
 * A custom representation rather than the default: a chart screen needs a name and a launch context,
 * and never the launch URL, since where a launch is sent is the server's business.
 */
export function useSmartApps() {
  const { data, error, isLoading } = useSWR<{ data: SmartAppsResponse }>(
    '/ws/rest/v1/smartapp?v=custom:(uuid,display,description,launchContext)',
    openmrsFetch,
    {
      // The registry is deployment configuration; it does not change while a clinician works.
      revalidateOnFocus: false,
    },
  );

  return {
    apps: data?.data?.results ?? [],
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
export function launchUrlFor(appId: string, patientUuid: string) {
  const target = new URL(`${window.openmrsBase}/ms/smartEhrLaunchServlet`, window.location.origin);
  target.searchParams.set('appId', appId);
  target.searchParams.set('patientId', patientUuid);

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
