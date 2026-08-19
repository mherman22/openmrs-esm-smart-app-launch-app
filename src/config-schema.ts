import { Type } from '@openmrs/esm-framework';

export const configSchema = {
  patientSearch: {
    resultsToShow: {
      _type: Type.Number,
      _default: 20,
      _description:
        'How many patients a search returns on the standalone-launch selection screen. A launch is ' +
        'started for one patient, so this is a limit on scrolling rather than on what can be found: ' +
        'raising it makes a broad search slower without making it more likely to include the right ' +
        'person. Narrowing the search term is the better answer.',
    },
  },
};

export interface ConfigSchema {
  patientSearch: {
    resultsToShow: number;
  };
}
