/**
 * The real `t` substitutes {{placeholders}} from its options. Returning the raw default string
 * instead would make any test that checks interpolated text fail for a reason that has nothing
 * to do with the component, so the mock interpolates too.
 */
function interpolate(template, options) {
  if (!template || !options) {
    return template;
  }

  return template.replace(/{{\s*(\w+)\s*}}/g, (match, name) => (name in options ? String(options[name]) : match));
}

module.exports = {
  useTranslation: () => ({
    t: (key, defaultValue, options) => {
      // react-i18next allows t(key, options) as well as t(key, default, options).
      if (typeof defaultValue === 'object' && defaultValue !== null) {
        return interpolate(key, defaultValue);
      }
      return interpolate(defaultValue || key, options);
    },
    i18n: {
      changeLanguage: () => new Promise(() => {}),
    },
  }),
  Trans: ({ children }) => children,
};
