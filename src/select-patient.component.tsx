import React from 'react';
import { useTranslation } from 'react-i18next';
import { Layer, Tile } from '@carbon/react';
import styles from './select-patient.scss';

const SelectPatient: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className={styles.container}>
      <Layer>
        <Tile className={styles.tile}>
          <h1 className={styles.heading}>
            {t('selectPatientHeading', 'SelectPatient')}
          </h1>
          <p className={styles.content}>
            {t('selectPatientDescription', 'Welcome to the SelectPatient page.')}
          </p>
        </Tile>
      </Layer>
    </div>
  );
};

export default SelectPatient;