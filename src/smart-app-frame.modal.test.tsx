import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SmartAppFrameModal from './smart-app-frame.modal';

vi.mock('@openmrs/esm-framework', () => ({ openmrsFetch: vi.fn() }));

const PATIENT = 'patient-uuid-1';

describe('a framed app', () => {
  beforeEach(() => {
    window.openmrsBase = '/openmrs';
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, assign: vi.fn(), origin: 'http://localhost' },
    });
  });

  it('points the frame at the launch servlet, not at the app', () => {
    // The app's address is the server's business. Framing the servlet means the whole handshake --
    // redirect, authorization, OpenMRS vouching, the return with a code -- happens inside the frame.
    render(
      <SmartAppFrameModal appId="vitals-review" appName="Vitals Review" patientUuid={PATIENT} closeModal={vi.fn()} />,
    );

    const frame = screen.getByTitle('Vitals Review') as HTMLIFrameElement;
    const src = new URL(frame.src, 'http://localhost');

    expect(src.pathname).toBe('/openmrs/ms/smartEhrLaunchServlet');
    expect(src.searchParams.get('appId')).toBe('vitals-review');
    expect(src.searchParams.get('patientId')).toBe(PATIENT);
  });

  it('is not sandboxed, because the OAuth2 handshake needs what a sandbox removes', () => {
    render(<SmartAppFrameModal appId="a" appName="An app" patientUuid={PATIENT} closeModal={vi.fn()} />);

    expect(screen.getByTitle('An app')).not.toHaveAttribute('sandbox');
  });

  it('offers a way out when the app refuses to be framed', async () => {
    // A content-security-policy of `frame-ancestors 'self'` leaves the frame blank, and a blank frame
    // looks exactly like a slow one. The escape hatch is the same launch as an ordinary navigation.
    render(
      <SmartAppFrameModal appId="vitals-review" appName="Vitals Review" patientUuid={PATIENT} closeModal={vi.fn()} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /open it in this tab instead/i }));

    expect(window.location.assign).toHaveBeenCalledWith(expect.stringContaining('appId=vitals-review'));
  });
});
