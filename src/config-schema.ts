import { Type, validators } from '@openmrs/esm-framework';

export const configSchema = {
  launchMode: {
    _type: Type.String,
    _default: 'iframe',
    _validators: [validators.oneOf(['iframe', 'redirect'])],
    _description:
      "How a launched app is presented. 'iframe' keeps the clinician in the chart, with the app in a " +
      "dialog over it; 'redirect' navigates away to the app, which is what a SMART app expects by " +
      'default. An app can refuse to be framed -- its content-security-policy decides -- so a ' +
      "deployment whose app sets frame-ancestors 'self' must use 'redirect' or the dialog stays blank.",
  },
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
  launchMode: 'iframe' | 'redirect';
  patientSearch: {
    resultsToShow: number;
  };
}
