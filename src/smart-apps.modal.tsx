import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { showModal, useConfig } from '@openmrs/esm-framework';
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

  const launch = (appId: string, appName: string) => {
    setLaunching(appId);

    // 'redirect' leaves the chart, which is what a SMART app expects by default. 'iframe' keeps the
    // clinician here and puts the app in a dialog over the chart; the picker closes as it opens, because
    // two stacked dialogs would leave them looking at a list they have already finished with.
    if (config.launchMode === 'iframe') {
      closeModal();
      const dispose = showModal('smart-app-frame-modal', {
        appId,
        appName,
        patientUuid,
        closeModal: () => dispose(),
      });
      return;
    }

    launchSmartApp(appId, patientUuid);
  };

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
