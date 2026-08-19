import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, InlineLoading, InlineNotification, Layer, Search, Tile } from '@carbon/react';
import { age, formatDate, parseDate, useConfig, useSession } from '@openmrs/esm-framework';
import { usePatientSearch, type SearchedPatient } from './patient-search.resource';
import { type ConfigSchema } from './config-schema';
import styles from './select-patient.scss';

/**
 * Completes a SMART launch that needs a patient chosen.
 *
 * The authorization server sends the browser here part-way through a launch, carrying a signed
 * launch token it expects back. Choosing a patient hands the token and the patient to the
 * OpenMRS launch endpoint, which signs them into a new token and redirects onward to finish the
 * launch. This page never sees the app's access token, and does not need to.
 *
 * The launch token is passed straight back rather than inspected. It is signed with a secret
 * shared only between the server and the authorization server, so nothing here could
 * meaningfully validate it, and any decision this page made on its own would not be trusted.
 */
const SelectPatient: React.FC = () => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [handingOff, setHandingOff] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const { launchToken, appName } = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      launchToken: params.get('token'),
      appName: params.get('appName') ?? params.get('app'),
    };
  }, []);

  // The launch reaches this screen through the module's patient-selection servlet, which turns the
  // launch token into an OpenMRS session before the browser gets here. So a session already exists,
  // and the searches below carry it; arriving without one means something bypassed that servlet.
  const session = useSession();
  const { patientSearch } = useConfig<ConfigSchema>();
  const { patients, isLoading, error, hasSearched } = usePatientSearch(query, patientSearch.resultsToShow);

  const selectPatient = useCallback(
    (patient: SearchedPatient) => {
      setHandingOff(true);

      // A whole-page navigation, not a client-side route: the server responds with a redirect to
      // the authorization server, which is outside this application.
      const target = new URL(`${window.openmrsBase}/ms/smartLaunchOptionSelected`, window.location.origin);
      target.searchParams.set('token', launchToken);
      target.searchParams.set('patientId', patient.uuid);

      window.location.assign(target.toString());
    },
    [launchToken],
  );

  // Without the token the authorization server issued there is no launch to complete. Saying so
  // is more use than a search box that could never succeed.
  if (!launchToken) {
    return (
      <div className={styles.container}>
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title={t('missingToken', 'This link is not a valid launch')}
          subtitle={t(
            'missingTokenDetail',
            'It carries no launch token, so there is nothing to complete. Start the app again from your patient chart or app gallery.',
          )}
        />
      </div>
    );
  }

  // Every search below needs the session the servlet established. Without it they would all answer
  // 401, which reads as a permissions problem rather than a broken launch.
  if (!session.authenticated) {
    return (
      <div className={styles.container}>
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title={t('sessionFailed', 'Could not start this launch')}
          subtitle={t(
            'sessionFailedDetail',
            'The launch token was not accepted. It may have expired, or already been used. Start the app again.',
          )}
        />
      </div>
    );
  }

  if (cancelled) {
    return (
      <div className={styles.container}>
        <InlineNotification
          kind="info"
          lowContrast
          hideCloseButton
          title={t('launchCancelled', 'Launch cancelled')}
          subtitle={t('launchCancelledDetail', 'No patient record was shared. You can close this tab.')}
        />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Layer>
        <div className={styles.header}>
          <h1 className={styles.heading}>{t('selectPatientHeading', 'Choose a patient for this app')}</h1>
          <p className={styles.subtitle}>
            {t(
              'selectPatientDescription',
              '{{appName}} is asking to open a patient record. The record you choose is the only one it will be given access to.',
              { appName: appName || t('anApplication', 'An application') },
            )}
          </p>
        </div>

        <Search
          labelText={t('searchLabel', 'Search by name or identifier')}
          placeholder={t('searchLabel', 'Search by name or identifier')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={handingOff}
          size="lg"
        />

        {error ? (
          <InlineNotification
            kind="error"
            lowContrast
            className={styles.notification}
            title={t('searchFailed', 'Could not search for patients')}
            subtitle={error?.message}
          />
        ) : null}

        {isLoading ? <InlineLoading className={styles.loading} description={t('searching', 'Searching')} /> : null}

        {!isLoading && !hasSearched ? (
          <Tile className={styles.empty}>
            <p className={styles.emptyBody}>
              {t('searchPrompt', 'Search for the patient whose record this app should open')}
            </p>
          </Tile>
        ) : null}

        {!isLoading && hasSearched && patients.length === 0 ? (
          <Tile className={styles.empty}>
            <p className={styles.emptyTitle}>{t('noResults', 'No patients match that search')}</p>
            <p className={styles.emptyBody}>
              {t('noResultsDetail', 'Check the spelling, or search by identifier instead.')}
            </p>
          </Tile>
        ) : null}

        <ul className={styles.results}>
          {patients.map((patient) => (
            <li key={patient.uuid}>
              <Tile className={styles.result}>
                <div>
                  <span className={styles.name}>{patient.person?.display ?? patient.display}</span>
                  <span className={styles.detail}>
                    {[
                      patient.person?.gender,
                      patient.person?.birthdate ? age(patient.person.birthdate) : null,
                      patient.person?.birthdate ? formatDate(parseDate(patient.person.birthdate)) : null,
                      patient.identifiers?.[0]?.identifier,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                <Button size="sm" disabled={handingOff} onClick={() => selectPatient(patient)}>
                  {t('selectPatient', 'Select')}
                </Button>
              </Tile>
            </li>
          ))}
        </ul>

        <div className={styles.actions}>
          <Button kind="ghost" disabled={handingOff} onClick={() => setCancelled(true)}>
            {t('cancelLaunch', 'Cancel')}
          </Button>
        </div>
      </Layer>
    </div>
  );
};

export default SelectPatient;
