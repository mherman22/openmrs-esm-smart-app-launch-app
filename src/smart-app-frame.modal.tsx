import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ModalBody, ModalHeader } from '@carbon/react';
import { Launch } from '@carbon/react/icons';
import { launchUrlFor } from './smart-apps.resource';
import styles from './smart-app-frame.scss';

interface SmartAppFrameModalProps {
  appId: string;
  appName: string;
  patientUuid: string;
  closeModal: () => void;
}

/**
 * A launched SMART app, shown over the chart instead of replacing it.
 *
 * The iframe's source is the launch servlet, not the app: the whole handshake — the redirect to the
 * app, the authorization request, OpenMRS vouching for the signed-in clinician, the return with a code
 * — happens inside the frame. That works because every hop through the authorization server is a
 * redirect with no page to render, so its `X-Frame-Options` never has a document to refuse.
 *
 * Whether the app itself can be framed is the app's decision, declared in its own
 * content-security-policy. One that sets `frame-ancestors 'self'` leaves this dialog blank, and a blank
 * dialog is indistinguishable from a slow one -- so the header always offers the same launch as a normal
 * navigation, and a deployment whose app refuses framing should set `launchMode` to `redirect`.
 */
const SmartAppFrameModal: React.FC<SmartAppFrameModalProps> = ({ appId, appName, patientUuid, closeModal }) => {
  const { t } = useTranslation();
  const src = launchUrlFor(appId, patientUuid, { embedded: true });

  return (
    <>
      <ModalHeader closeModal={closeModal} title={appName} />
      <ModalBody className={styles.body}>
        <iframe
          className={styles.frame}
          src={src}
          title={appName}
          // No sandbox: the app needs its own origin, scripts and form posts to complete the OAuth2
          // handshake, and a sandbox tight enough to be worth having breaks it. What limits the app is
          // the token it is given -- scoped, short-lived, and for one patient.
          allow="clipboard-write"
        />
        <p className={styles.escape}>
          {t('frameBlankHint', 'Nothing here? The app may not permit being embedded.')}{' '}
          <Button kind="ghost" size="sm" renderIcon={Launch} onClick={() => window.location.assign(src)}>
            {t('openInPlace', 'Open it in this tab instead')}
          </Button>
        </p>
      </ModalBody>
    </>
  );
};

export default SmartAppFrameModal;
