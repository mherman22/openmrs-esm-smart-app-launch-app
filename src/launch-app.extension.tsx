import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { MenuItem } from '@carbon/react';
import { showModal } from '@openmrs/esm-framework';
import { useSmartApps } from './smart-apps.resource';

interface LaunchAppActionProps {
  patientUuid: string;
}

/**
 * The way a clinician starts a SMART app for the patient they are looking at.
 *
 * Hidden entirely when the server has no registered apps, which is the normal state of a deployment
 * that has not integrated any: an action that opens an empty list is worse than no action. Users who
 * cannot read the registry never reach this at all, since the extension declares the privilege it needs.
 */
const LaunchAppAction: React.FC<LaunchAppActionProps> = ({ patientUuid }) => {
  const { t } = useTranslation();
  const { apps, isLoading, error } = useSmartApps();

  const openAppList = useCallback(() => {
    const dispose = showModal('smart-apps-modal', {
      patientUuid,
      closeModal: () => dispose(),
    });
  }, [patientUuid]);

  // An error is not the same as an empty registry, and hiding both left a failed request visible
  // only in the browser console. On a failure the action stays, and the dialog says what went wrong.
  if (isLoading || (!error && apps.length === 0)) {
    return null;
  }

  // A MenuItem, not a Button: this slot is the patient banner's Actions menu, and the chart's own
  // entries in it are menu items. A button inside a menu looks like a mistake and does not keyboard
  // navigate with the rest.
  return <MenuItem label={t('launchApp', 'Launch an app')} onClick={openAppList} />;
};

export default LaunchAppAction;
