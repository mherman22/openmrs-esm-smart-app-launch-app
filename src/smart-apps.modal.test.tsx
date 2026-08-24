import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SmartAppsModal from './smart-apps.modal';
import LaunchAppAction from './launch-app.extension';
import { useSmartApps } from './smart-apps.resource';
import type * as SmartAppsResource from './smart-apps.resource';

// Only the hook is mocked: launchSmartApp builds the launch URL, which is what the tests below check.
vi.mock('./smart-apps.resource', async () => {
  const actual = await vi.importActual<typeof SmartAppsResource>('./smart-apps.resource');
  return { ...actual, useSmartApps: vi.fn() };
});

const mockShowModal = vi.fn((_name: string, _props?: Record<string, unknown>) => vi.fn());

// Each test states the mode it is about. The shipped default is 'iframe'; these start from 'redirect'
// because that is the behaviour the older assertions were written against.
let launchMode: 'iframe' | 'redirect' = 'redirect';

vi.mock('@openmrs/esm-framework', () => ({
  showModal: (name: string, props?: Record<string, unknown>) => mockShowModal(name, props),
  useConfig: () => ({ launchMode }),
  openmrsFetch: vi.fn(),
}));

// The action renders as a menu item, because the slot it goes into is the banner's Actions menu.
const launchMenuItem = () => screen.queryByRole('menuitem', { name: /launch an app/i });

const mockUseSmartApps = vi.mocked(useSmartApps);
const PATIENT = 'patient-uuid-1';

function appsAre(state: Partial<ReturnType<typeof useSmartApps>>) {
  mockUseSmartApps.mockReturnValue({
    apps: [],
    isLoading: false,
    error: undefined,
    ...state,
  } as ReturnType<typeof useSmartApps>);
}

const GROWTH_CHART = { id: 'growth-chart', name: 'Growth Chart', description: 'Plots growth over time' };

beforeEach(() => {
  launchMode = 'redirect';
  (window as unknown as { openmrsBase: string }).openmrsBase = '/openmrs';
  Object.defineProperty(window, 'location', {
    writable: true,
    value: new URL('http://localhost/openmrs/spa/patient/patient-uuid-1/chart') as unknown as Location,
  });
  (window.location as unknown as { assign: () => void }).assign = vi.fn();
  appsAre({ apps: [GROWTH_CHART] });
});

afterEach(() => vi.clearAllMocks());

describe('the action that starts a launch', () => {
  /**
   * A deployment that has registered no apps is the normal state, and an action that opens an empty
   * list teaches a clinician to ignore it.
   */
  it('is not offered when the server has no registered apps', () => {
    appsAre({ apps: [] });

    render(<LaunchAppAction patientUuid={PATIENT} />);

    expect(launchMenuItem()).not.toBeInTheDocument();
  });

  it('is not offered while the list is still loading', () => {
    appsAre({ apps: [], isLoading: true });

    render(<LaunchAppAction patientUuid={PATIENT} />);

    expect(launchMenuItem()).not.toBeInTheDocument();
  });

  it('opens the app list for the patient in the chart', async () => {
    const user = userEvent.setup();

    render(<LaunchAppAction patientUuid={PATIENT} />);
    await user.click(launchMenuItem());

    expect(mockShowModal).toHaveBeenCalledWith('smart-apps-modal', expect.objectContaining({ patientUuid: PATIENT }));
  });
});

describe('the app list', () => {
  it('names each app and offers to launch it', () => {
    render(<SmartAppsModal patientUuid={PATIENT} closeModal={vi.fn()} />);

    expect(screen.getByText('Growth Chart')).toBeInTheDocument();
    expect(screen.getByText(/plots growth over time/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Launch$/ })).toBeInTheDocument();
  });

  /**
   * The app is named by id and nothing else. The launch URL lives on the server and is looked up
   * there, so that nothing in the browser can decide — or be persuaded — where a clinician is sent.
   */
  it('starts the launch on the server, naming the app by id', async () => {
    const user = userEvent.setup();

    render(<SmartAppsModal patientUuid={PATIENT} closeModal={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /^Launch$/ }));

    const target = new URL(vi.mocked(window.location.assign).mock.calls[0][0] as string, 'http://localhost');
    expect(target.pathname).toBe('/openmrs/ms/smartEhrLaunchServlet');
    expect(target.searchParams.get('appId')).toBe('growth-chart');
    expect(target.searchParams.get('patientId')).toBe(PATIENT);
    expect(target.searchParams.get('launchUrl'), 'the browser must not name a launch address').toBeNull();
    // Nothing frames this one, so it must not claim the chart is showing a patient header.
    expect(target.searchParams.get('embedded')).toBeNull();
  });

  it('launches once, however many times the button is pressed', async () => {
    // A launch handle is single-use. Two launches meant two dialogs, the second showing the server's
    // `400 Unknown launch` where the app should have been.
    launchMode = 'iframe';
    appsAre({ apps: [{ id: 'vitals-review', name: 'Vitals Review' }] });

    render(<SmartAppsModal patientUuid={PATIENT} closeModal={vi.fn()} />);
    const button = screen.getByRole('button', { name: /^launch$/i });
    await userEvent.click(button);
    await userEvent.click(button);
    await userEvent.click(button);

    expect(screen.getAllByTitle('Vitals Review')).toHaveLength(1);
  });

  it('frames the app over the chart instead, when that is how the deployment presents a launch', async () => {
    launchMode = 'iframe';
    appsAre({ apps: [{ id: 'vitals-review', name: 'Vitals Review' }] });
    const closeModal = vi.fn();

    render(<SmartAppsModal patientUuid={PATIENT} closeModal={closeModal} />);
    await userEvent.click(screen.getByRole('button', { name: /^launch$/i }));

    // The clinician stays where they are: no navigation at all.
    expect(window.location.assign).not.toHaveBeenCalled();

    // One dialog, which becomes the app. Asking the modal system for a second one produced two
    // containers from a single call, and the second showed `400 Unknown launch`.
    const frames = screen.getAllByTitle('Vitals Review');
    expect(frames).toHaveLength(1);
    const src = new URL((frames[0] as HTMLIFrameElement).src, 'http://localhost');
    expect(src.pathname).toBe('/openmrs/ms/smartEhrLaunchServlet');
    expect(src.searchParams.get('appId')).toBe('vitals-review');
    // Framed inside the chart, so the app is told the chart is already naming the patient.
    expect(src.searchParams.get('embedded')).toBe('true');
  });

  it('explains a list that could not be loaded', () => {
    appsAre({ apps: [], error: new Error('network down') });

    render(<SmartAppsModal patientUuid={PATIENT} closeModal={vi.fn()} />);

    expect(screen.getByText(/could not load the available apps/i)).toBeInTheDocument();
  });

  it('says so when nothing is registered, rather than showing an empty list', () => {
    appsAre({ apps: [] });

    render(<SmartAppsModal patientUuid={PATIENT} closeModal={vi.fn()} />);

    expect(screen.getByText(/no apps are available/i)).toBeInTheDocument();
  });

  it('shares nothing when the clinician cancels', async () => {
    const user = userEvent.setup();
    const closeModal = vi.fn();

    render(<SmartAppsModal patientUuid={PATIENT} closeModal={closeModal} />);
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(closeModal).toHaveBeenCalled();
    expect(window.location.assign).not.toHaveBeenCalled();
  });
});
