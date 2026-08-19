import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SelectPatient from './select-patient.component';
import { getDefaultsFromConfigSchema, useConfig, useSession } from '@openmrs/esm-framework';
import type * as EsmFramework from '@openmrs/esm-framework';
import { usePatientSearch } from './patient-search.resource';
import { configSchema, type ConfigSchema } from './config-schema';

vi.mock('./patient-search.resource');

vi.mock('@openmrs/esm-framework', async () => {
  const actual = await vi.importActual<typeof EsmFramework>('@openmrs/esm-framework');

  return {
    // Spread rather than listed: the module under test imports Type from here through the config
    // schema, and a mock that enumerates only what the component uses breaks the moment anything
    // else in the tree reaches for the framework. getDefaultsFromConfigSchema in particular is left
    // real, so a test reads the same values a deployment gets before anyone configures anything.
    ...actual,
    age: () => '34',
    formatDate: () => '01-Jan-1990',
    parseDate: (value: string) => new Date(value),
    openmrsFetch: vi.fn(),
    restBaseUrl: '/ws/rest/v1',
    useConfig: vi.fn(),
    useSession: vi.fn(),
  };
});

const mockUsePatientSearch = vi.mocked(usePatientSearch);
const mockUseConfig = vi.mocked(useConfig<ConfigSchema>);
const mockUseSession = vi.mocked(useSession);

/**
 * The session is established by the module's servlet before this screen loads, so the normal case
 * is an authenticated session already in place.
 */
function sessionIs(state: Partial<ReturnType<typeof useSession>>) {
  mockUseSession.mockReturnValue({ authenticated: true, ...state } as ReturnType<typeof useSession>);
}

const ADA = {
  uuid: 'patient-uuid-1',
  display: '10000X - Ada Lovelace',
  identifiers: [{ identifier: '10000X' }],
  person: { display: 'Ada Lovelace', gender: 'F', birthdate: '1990-01-01' },
};

/** Puts a launch token in the URL, which is how the authorization server arrives here. */
function withUrl(search: string) {
  Object.defineProperty(window, 'location', {
    writable: true,
    value: new URL(`http://localhost/openmrs/spa/smart/select-patient${search}`) as unknown as Location,
  });
  (window.location as unknown as { assign: () => void }).assign = vi.fn();
}

function searchReturns(patients: Array<typeof ADA>, overrides = {}) {
  mockUsePatientSearch.mockReturnValue({
    patients,
    isLoading: false,
    error: undefined,
    hasSearched: patients.length > 0,
    ...overrides,
  } as ReturnType<typeof usePatientSearch>);
}

describe('SelectPatient', () => {
  beforeEach(() => {
    mockUseConfig.mockReturnValue(getDefaultsFromConfigSchema(configSchema));
    (window as unknown as { openmrsBase: string }).openmrsBase = '/openmrs';
    withUrl('?token=signed-launch-token&appName=Growth%20Chart');
    sessionIs({});
    searchReturns([]);
  });

  afterEach(() => vi.clearAllMocks());

  it('names the app that is asking, so the clinician knows what they are sharing with', () => {
    render(<SelectPatient />);

    expect(screen.getByRole('heading', { name: /choose a patient/i })).toBeInTheDocument();
    expect(screen.getByText(/Growth Chart/)).toBeInTheDocument();
  });

  /**
   * The launch cannot be completed without the token, and a search box that could never succeed
   * is worse than saying so.
   */
  it('refuses a link with no launch token, and offers no search', () => {
    withUrl('');

    render(<SelectPatient />);

    expect(screen.getByText(/not a valid launch/i)).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('hands the chosen patient and the original token to the launch endpoint', async () => {
    const user = userEvent.setup();
    searchReturns([ADA]);

    render(<SelectPatient />);
    await user.click(screen.getByRole('button', { name: /select/i }));

    await waitFor(() => expect(window.location.assign).toHaveBeenCalled());

    const target = new URL(vi.mocked(window.location.assign).mock.calls[0][0] as string, 'http://localhost');
    expect(target.pathname).toBe('/openmrs/ms/smartLaunchOptionSelected');
    expect(target.searchParams.get('patientId')).toBe(ADA.uuid);
    // Passed back unaltered: it is signed with a secret this page does not hold.
    expect(target.searchParams.get('token')).toBe('signed-launch-token');
  });

  it('shares nothing when the clinician cancels', async () => {
    const user = userEvent.setup();
    searchReturns([ADA]);

    render(<SelectPatient />);
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.getByText(/launch cancelled/i)).toBeInTheDocument();
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  /**
   * Every search needs the session the servlet established. Offering a search box without one would
   * produce nothing but 401s, which read as a permissions problem rather than a broken launch.
   */
  it('explains a launch that arrived without a session, and offers no search', () => {
    sessionIs({ authenticated: false });

    render(<SelectPatient />);

    expect(screen.getByText(/could not start this launch/i)).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('says so when a search matches nobody, rather than looking broken', () => {
    sessionIs({});
    searchReturns([], { hasSearched: true });

    render(<SelectPatient />);

    expect(screen.getByText(/no patients match/i)).toBeInTheDocument();
  });

  it('surfaces a failed search instead of showing an empty list', () => {
    searchReturns([], { hasSearched: true, error: new Error('network down') });

    render(<SelectPatient />);

    expect(screen.getByText(/could not search for patients/i)).toBeInTheDocument();
  });
});
