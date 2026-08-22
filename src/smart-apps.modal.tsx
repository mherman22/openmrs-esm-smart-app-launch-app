import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useConfig } from '@openmrs/esm-framework';
import {
  Button,
  InlineLoading,
  InlineNotification,
  ModalBody,
  ModalFooter,
  ModalHeader,
  StructuredListBody,
  StructuredListCell,
  StructuredListRow,
  StructuredListWrapper,
} from '@carbon/react';
import { useSmartApps, launchSmartApp } from './smart-apps.resource';
import type { ConfigSchema } from './config-schema';
import SmartAppFrame from './smart-app-frame.modal';

interface SmartAppsModalProps {
  patientUuid: string;
  closeModal: () => void;
}

/**
 * Lists the SMART apps a clinician may open for this patient, and starts an EHR launch for whichever
 * they choose.
 *
 * The app is named by id and nothing more. The server holds each app's launch URL and looks it up,
 * so this screen cannot decide — or be persuaded — where a clinician is sent.
 */
const SmartAppsModal: React.FC<SmartAppsModalProps> = ({ patientUuid, closeModal }) => {
  const { t } = useTranslation();
  const { apps, isLoading, error } = useSmartApps();
  const config = useConfig<ConfigSchema>();
  const [launching, setLaunching] = useState<string | null>(null);
  const started = useRef(false);
  const [framed, setFramed] = useState<{ appId: string; appName: string } | null>(null);

  const launch = (appId: string, appName: string) => {
    // A launch handle is single-use, so launching twice is never right: the second attempt redeems a
    // handle the first already spent and the server answers `400 Unknown launch`. The disabled button
    // is not enough on its own -- it only disables after the state update, and a second event dispatched
    // before that slips through, which showed up as two dialogs side by side, one of them an error page.
    if (started.current) {
      return;
    }
    started.current = true;

    setLaunching(appId);

    // 'redirect' leaves the chart, which is what a SMART app expects by default. 'iframe' keeps the
    // clinician here and puts the app in a dialog over the chart; the picker closes as it opens, because
    // two stacked dialogs would leave them looking at a list they have already finished with.
    if (config.launchMode === 'iframe') {
      setFramed({ appId, appName });
      return;
    }

    launchSmartApp(appId, patientUuid);
  };

  // The app replaces the list inside this dialog rather than opening a second one. Asking the modal
  // system for another dialog produced two: one call, two containers, two iframes, and because a launch
  // handle is single-use the second showed the server's `400 Unknown launch` beside the working app.
  if (framed) {
    return (
      <SmartAppFrame appId={framed.appId} appName={framed.appName} patientUuid={patientUuid} closeModal={closeModal} />
    );
  }

  return (
    <>
      <ModalHeader closeModal={closeModal} title={t('launchAnApp', 'Launch an app')} />
      <ModalBody>
        <p>
          {t(
            'launchAppDescription',
            'The app will be given access to this patient’s record. You will not be asked to sign in again.',
          )}
        </p>

        {isLoading ? <InlineLoading description={t('loadingApps', 'Loading apps')} /> : null}

        {error ? (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title={t('appsFailed', 'Could not load the available apps')}
            subtitle={error?.message}
          />
        ) : null}

        {!isLoading && !error && apps.length === 0 ? (
          <InlineNotification
            kind="info"
            lowContrast
            hideCloseButton
            title={t('noApps', 'No apps are available')}
            subtitle={t('noAppsDetail', 'No SMART apps have been registered on this server.')}
          />
        ) : null}

        {apps.length > 0 ? (
          <StructuredListWrapper selection>
            <StructuredListBody>
              {apps.map((app) => (
                <StructuredListRow key={app.id}>
                  <StructuredListCell>
                    <strong>{app.name}</strong>
                    {app.description ? <div>{app.description}</div> : null}
                  </StructuredListCell>
                  <StructuredListCell>
                    <Button size="sm" disabled={launching !== null} onClick={() => launch(app.id, app.name)}>
                      {launching === app.id ? t('launching', 'Launching') : t('launch', 'Launch')}
                    </Button>
                  </StructuredListCell>
                </StructuredListRow>
              ))}
            </StructuredListBody>
          </StructuredListWrapper>
        ) : null}
      </ModalBody>
      <ModalFooter>
        <Button kind="secondary" onClick={closeModal}>
          {t('cancel', 'Cancel')}
        </Button>
      </ModalFooter>
    </>
  );
};

export default SmartAppsModal;
