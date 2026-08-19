import useSWR from 'swr';
import { openmrsFetch, restBaseUrl } from '@openmrs/esm-framework';

export interface SearchedPatient {
  uuid: string;
  display: string;
  identifiers?: Array<{ identifier: string }>;
  person?: {
    display: string;
    gender: string;
    birthdate: string;
  };
}

interface PatientSearchResponse {
  results: Array<SearchedPatient>;
}

const MINIMUM_QUERY_LENGTH = 2;

/**
 * Searches for patients by name or identifier.
 *
 * Deliberately the REST search rather than FHIR. This page runs in the middle of a launch,
 * before any SMART token exists, so the FHIR endpoints the app is about to use are not
 * available to it yet; what it does have is an ordinary OpenMRS session.
 */
export function usePatientSearch(query: string, resultsToShow: number) {
  const trimmed = query?.trim() ?? '';
  const shouldSearch = trimmed.length >= MINIMUM_QUERY_LENGTH;

  const url = shouldSearch
    ? `${restBaseUrl}/patient?q=${encodeURIComponent(trimmed)}` +
      `&v=custom:(uuid,display,identifiers:(identifier),person:(display,gender,birthdate))&limit=${resultsToShow}`
    : null;

  const { data, error, isLoading } = useSWR<{ data: PatientSearchResponse }>(url, openmrsFetch, {
    // A clinician retypes while searching; revalidating on focus would reorder results underneath them.
    revalidateOnFocus: false,
  });

  return {
    patients: data?.data?.results ?? [],
    isLoading: shouldSearch && isLoading,
    error,
    hasSearched: shouldSearch,
  };
}
