const config = require('openmrs/default-rspack-config');

// The 244 KiB asset-size budget rspack warns about isn't meaningful for O3
// modules: framework + Carbon design system push every bundle past it, so the
// hint just adds noise on every build. Disable it.
config.overrides.performance = { hints: false };

// Content-address the lazy chunks. rspack names them `[id].js` by default -- 117.js, 163.js -- so a
// chunk's URL stays the same while its contents change from build to build. Nothing else in the URL
// moves either: this module is not published, so its version stays 1.0.0 and the directory it is
// served from stays `uwdigi-esm-smart-app-launch-app-1.0.0/`. A browser that cached 117.js from an
// earlier build therefore serves it beside a current entry file, the module ids disagree, and the
// page dies in LOADING_SOURCE_CODE with `__webpack_modules__[e] is undefined` -- reported against the
// patient picker, whose component is the one chunk only that route loads.
//
// A cache header cannot fix that: `no-cache` on today's response says nothing about a response the
// browser stored last month under `expires 1y`. Only a different URL can, so the hash goes in the
// name. It also makes those files safely cacheable forever, which is what a content-addressed URL is
// for.
config.overrides.output = { chunkFilename: '[id].[contenthash:8].js' };

module.exports = config;
