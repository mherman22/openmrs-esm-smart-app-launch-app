import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { InlineNotification } from '@carbon/react';
import { UserHasAccess } from '@openmrs/esm-framework';
import SelectPatient from './select-patient.component';
import { PRIVILEGE_GET_SMART_APPS } from './constants';

/**
 * Why the page is empty, for someone an app redirected here who cannot read the registry. A blank
 * screen would otherwise look like the launch itself had failed.
 */
const NotPermitted: React.FC = () => {
  const { t } = useTranslation();

  return (
    <InlineNotification
      kind="error"
      lowContrast
      hideCloseButton
      title={t('notPermitted', 'You cannot launch apps')}
      subtitle={t(
        'notPermittedDetail',
        'Your account does not have the "Get SMART Apps" privilege. Ask an administrator to add it to one of your roles.',
      )}
    />
  );
};

const Root: React.FC = () => (
  <BrowserRouter basename={window.getOpenmrsSpaBase()}>
    <Routes>
      <Route
        path="smart/select-patient"
        element={
          <UserHasAccess privilege={PRIVILEGE_GET_SMART_APPS} fallback={<NotPermitted />}>
            <SelectPatient />
          </UserHasAccess>
        }
      />
    </Routes>
  </BrowserRouter>
);

export default Root;
