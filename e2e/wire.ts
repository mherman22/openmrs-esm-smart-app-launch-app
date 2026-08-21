import type { BrowserContext, Page, Request } from '@playwright/test';
import * as fs from 'fs';

/**
 * Records the HTTP exchanges a launch actually makes, and writes them into the walkthrough
 * documentation in openmrs-distro-smartonfhir.
 *
 * The walkthroughs used to show a screenshot per step and a flat list of redirect URLs at the end.
 * That says where the browser went but not what was said: an implementer reading it could not see the
 * form the token request posts, or that the token response carries `patient`, or which scopes came
 * back. Those are the parts someone integrating has to reproduce, and prose describing them drifts
 * from the code the moment either changes.
 *
 * So the documentation quotes real traffic, captured by the same run that takes the screenshots. The
 * blocks are written between `<!-- wire:name -->` markers in the step docs, which keeps the prose
 * hand-written and the evidence generated.
 *
 * Everything here is committed to a public repository, so {@link redact} runs over every URL, header
 * and body. It keeps the shape -- a reader needs to see *that* there is a code_verifier -- and drops
 * the value.
 */

/**
 * An exchange worth quoting. Anything else the browser fetches is noise in a launch narrative.
 *
 * The discovery document is deliberately absent: reading a response body races with the page that
 * asked for it being torn down, and it appeared in one capture and vanished from the next, which
 * rewrote the committed documentation for no reason. The specs fetch that one directly and hand it
 * over with {@link Wire.record} instead.
 */
const INTERESTING = [
  '/ms/smartEhrLaunchServlet',
  '/ms/smartPatientSelection',
  '/ms/smartLaunchOptionSelected',
  '/smartonfhir/smartAccessConfirmation',
  '/protocol/openid-connect/auth',
  '/protocol/openid-connect/token',
  '/protocol/openid-connect/certs',
  '/ws/fhir2/R4/',
];

/** Headers that carry meaning for a SMART integration. The rest are browser bookkeeping. */
const HEADERS_WORTH_SHOWING = ['authorization', 'content-type', 'location', 'accept'];

const MAX_BODY = 1400;

export interface Exchange {
  step: string;
  method: string;
  url: string;
  status: number;
  requestHeaders: Record<string, string>;
  requestBody?: string;
  responseHeaders: Record<string, string>;
  responseBody?: string;
}

export class Wire {
  private exchanges: Exchange[] = [];

  private current = 'unstepped';

  /** Names the step subsequent exchanges belong to, matching a `<!-- wire:name -->` marker. */
  step(name: string) {
    this.current = name;
  }

  /**
   * Attaches to a page and to any page it opens. A launch commonly ends in a second tab, and the
   * token exchange happens there -- recording only the first page captured the launch and missed
   * every interesting thing the application did with it.
   */
  watch(pageOrContext: Page | BrowserContext) {
    const attach = (page: Page) => {
      page.on('response', async (response) => {
        const request = response.request();
        const url = request.url();

        if (!INTERESTING.some((fragment) => url.includes(fragment))) {
          return;
        }

        this.exchanges.push({
          step: this.current,
          method: request.method(),
          url,
          status: response.status(),
          requestHeaders: pick(await safeHeaders(request)),
          requestBody: request.postData() ?? undefined,
          responseHeaders: pick(response.headers()),
          // A redirect has no body worth quoting, and asking for one on a 302 throws.
          responseBody: response.status() >= 300 && response.status() < 400 ? undefined : await safeBody(response),
        });
      });
    };

    if ('newPage' in pageOrContext) {
      pageOrContext.on('page', attach);
    } else {
      attach(pageOrContext);
      pageOrContext.context().on('page', attach);
    }
  }

  /**
   * Records an exchange the browser never made.
   *
   * A standalone launch finishes outside the page: the token is redeemed and the FHIR API is read
   * through Playwright's request context, which no page listener sees. Those two calls are the ones a
   * standalone integrator most needs, so the spec hands them over directly.
   */
  record(exchange: Omit<Exchange, 'step'>) {
    this.exchanges.push({ step: this.current, ...exchange });
  }

  /** The exchanges recorded for a step, in the order they happened. */
  forStep(name: string): Exchange[] {
    return this.exchanges.filter((e) => e.step === name);
  }

  get stepNames(): string[] {
    return [...new Set(this.exchanges.map((e) => e.step))];
  }

  get all(): Exchange[] {
    return this.exchanges;
  }
}

/**
 * Groups exchanges by the endpoint they hit rather than by when they happened.
 *
 * Timing cannot do this. Most of a launch is server-side 302s that the browser commits as one
 * navigation, and responses arrive asynchronously, so labelling by "whatever step was current when
 * this fired" put the token exchange under whichever step happened to be running. Which endpoint was
 * called is a fact about the flow, so the grouping is stable across runs.
 */
export function group(exchanges: Exchange[]): Record<string, Exchange[]> {
  const grouped: Record<string, Exchange[]> = {};
  const seen = new Map<string, { name: string; index: number }>();

  for (const exchange of exchanges) {
    const { pathname } = new URL(exchange.url);
    let name: string | undefined;

    if (pathname.includes('smartEhrLaunchServlet')) name = 'ehr-launch';
    else if (pathname.includes('smart-configuration')) name = 'discovery';
    else if (pathname.includes('smartPatientSelection')) name = 'patient-selection';
    else if (pathname.includes('smartLaunchOptionSelected')) name = 'launch-option-selected';
    else if (pathname.includes('smartAccessConfirmation')) name = 'access-confirmation';
    else if (pathname.includes('openid-connect/auth')) name = 'authorize';
    else if (pathname.includes('openid-connect/token')) name = 'token';
    else if (pathname.includes('openid-connect/certs')) name = 'keys';
    // Only the reads the launched application makes. The chart the clinician came from talks to the
    // same FHIR API with a session cookie, and those requests were being documented under "every
    // request carries Authorization: Bearer" -- which they do not. The header is what tells the two
    // apart, and the distinction is the entire point of the bearer scheme.
    else if (pathname.includes('/ws/fhir2/'))
      name = /^bearer /i.test(exchange.requestHeaders.authorization ?? '') ? 'fhir' : undefined;

    if (!name) {
      continue;
    }

    // The same call repeats -- the application reads the discovery document on every load, and the
    // chart reads a patient once per widget. One of each is documentation; ten is a log.
    const fingerprint = `${name} ${exchange.method} ${pathname} ${exchange.status}`;
    const kept = seen.get(fingerprint);

    if (kept) {
      // Keep whichever copy actually has a body. Reading a response body races with the page that
      // asked for it, so the first copy of a call is sometimes bodyless -- and taking the first
      // regardless put the discovery document's response in one capture and left it out of the next,
      // rewriting the committed documentation either way.
      if (!grouped[kept.name][kept.index].responseBody && exchange.responseBody) {
        grouped[kept.name][kept.index] = exchange;
      }

      continue;
    }

    seen.set(fingerprint, { name, index: (grouped[name] ?? []).length });
    grouped[name] = [...(grouped[name] ?? []), exchange];
  }

  return grouped;
}

async function safeHeaders(request: Request): Promise<Record<string, string>> {
  try {
    return await request.allHeaders();
  } catch {
    return request.headers();
  }
}

async function safeBody(
  response: Awaited<ReturnType<Page['goto']>> extends never ? never : any,
): Promise<undefined | string> {
  try {
    const type = (response.headers()['content-type'] ?? '').toLowerCase();

    // Only text. A screenshot of the app is a screenshot; its bytes in a fenced block are nothing.
    if (!/json|text|xml|x-www-form-urlencoded/.test(type)) {
      return undefined;
    }

    return await response.text();
  } catch {
    // A response the browser never finished reading, typically because the page navigated away.
    return undefined;
  }
}

function pick(headers: Record<string, string>): Record<string, string> {
  const kept: Record<string, string> = {};

  for (const [name, value] of Object.entries(headers)) {
    if (HEADERS_WORTH_SHOWING.includes(name.toLowerCase())) {
      kept[name.toLowerCase()] = value;
    }
  }

  return kept;
}

/**
 * Drops every live credential while keeping the shape of what carried it.
 *
 * Deliberately aggressive: this output is committed, and a launch token that reaches a public
 * repository is a launch anybody can replay. The JWT rule is last and matches any three
 * base64url segments, so a token this list forgot to name still does not survive.
 */
export function redact(text: string): string {
  return (
    text
      // The literal {APP_TOKEN} is the authorization server handing the module a slot to fill, and is
      // the most informative part of that hop -- keep it.
      .replace(
        /(app-token%3D|app-token=|app_token=)(?!%7BAPP_TOKEN%7D|\{APP_TOKEN\})(?:(?!%26)[^&\s"]+)/g,
        '$1<signed launch token>',
      )
      .replace(/(launch=)[^&\s"]+/g, '$1<launch handle>')
      // The specific `code` parameters first, and the bare one last with a lookbehind. A plain
      // /(code=)/ ran over the tail of `session_code=` and over its own replacement, leaving
      // `session_code=<session code> code>` in the documentation.
      .replace(/(session_code%3D|session_code=)(?:(?!%26)[^&\s"]+)/g, '$1<session code>')
      .replace(/(code_verifier=)[^&\s"]+/g, '$1<PKCE verifier>')
      .replace(/(code_challenge=)[^&\s"]+/g, '$1<PKCE challenge>')
      .replace(/(?<![_a-zA-Z])(code=)(?!<)[^&\s"]+/g, '$1<authorization code>')
      .replace(/(?<![_a-zA-Z])(code%3D)(?!<)(?:(?!%26)[^&\s"]+)/g, '$1<authorization code>')
      // Two rules, not one: a single pattern loose enough to catch both forms ate the `":"` between
      // the JSON key and its value, which broke the parse -- so the body was quoted unformatted -- and
      // left part of the real value behind.
      .replace(/("session_state"\s*:\s*")[^"]*/g, '$1<session state>')
      .replace(/(session_state=)[^&\s"]+/g, '$1<session state>')
      .replace(/([?&]state=)[^&\s"]+/g, '$1<state>')
      .replace(/(client_data%3D|client_data=)(?:(?!%26)[^&\s"]+)/g, '$1<client data>')
      .replace(/(tab_id%3D|tab_id=)(?:(?!%26)[^&\s"]+)/g, '$1<tab id>')
      .replace(/(execution%3D|execution=)(?:(?!%26)[^&\s"]+)/g, '$1<execution>')
      .replace(/(client_secret=)[^&\s"]+/g, '$1<client secret>')
      .replace(/(JSESSIONID=)[^;\s]+/gi, '$1<session id>')
      // Token responses, and the Authorization header carrying one.
      .replace(/("(?:access_token|id_token|refresh_token)"\s*:\s*")[^"]+/g, '$1<jwt>')
      .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/g, '$1<jwt>')
      .replace(/(Basic\s+)[A-Za-z0-9+/=]+/g, '$1<credentials>')
      // Keycloak's action token: a signed, single-use URL back into an authentication session, so a
      // credential by any measure. Named explicitly because it is the mechanism a reader needs to see.
      .replace(/(action-token%3Fkey%3D|action-token\?key=)[^&\s"%]+/g, '$1<action token>')
      // No \b before eyJ. The boundary never matched where it mattered: these arrive URL-encoded as
      // `key%3DeyJ…`, and %3D ends in a word character, so three signed tokens reached the committed
      // documentation before this was caught.
      .replace(/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}(?:\.[A-Za-z0-9_-]*)?/g, '<jwt>')
  );
}

/**
 * Renders one step's exchanges as the fenced blocks the documentation shows.
 *
 * A request block is `http` so the method, path and headers highlight; a JSON response is `json` so
 * the body does. Long bodies are truncated rather than dropped: a FHIR bundle of five hundred
 * observations says everything it has to say in its first entry, and pasting all of it into a
 * walkthrough would bury the step.
 */
export function render(exchanges: Exchange[]): string {
  if (exchanges.length === 0) {
    return '_No HTTP exchange was recorded for this step._';
  }

  return exchanges
    .map((exchange) => {
      const url = new URL(exchange.url);
      const target = redact(`${url.pathname}${url.search}`);
      const lines = [`${exchange.method} ${target}`, `Host: ${url.host}`];

      for (const [name, value] of Object.entries(exchange.requestHeaders)) {
        if (name !== 'location') {
          lines.push(`${titleCase(name)}: ${redact(value)}`);
        }
      }

      if (exchange.requestBody) {
        lines.push('', body(redact(exchange.requestBody), exchange.requestHeaders['content-type']));
      }

      const blocks = ['```http', lines.join('\n'), '```'];
      const responseLines = [`${exchange.status} ${statusText(exchange.status)}`];

      if (exchange.responseHeaders.location) {
        responseLines.push(`Location: ${redact(exchange.responseHeaders.location)}`);
      }

      if (exchange.responseBody) {
        const contentType = exchange.responseHeaders['content-type'] ?? '';
        // Redact first, then truncate. The other way round spent the budget on credentials and cut
        // the response off mid-string: a token response is mostly JWT, and `patient` and `scope` --
        // the two fields a reader needs -- sit after them.
        const rendered = body(redact(exchange.responseBody), contentType);

        if (/json/.test(contentType)) {
          blocks.push('```http', responseLines.join('\n'), '```', '```json', rendered, '```');
        } else {
          blocks.push('```http', [...responseLines, '', rendered].join('\n'), '```');
        }
      } else {
        blocks.push('```http', responseLines.join('\n'), '```');
      }

      return blocks.join('\n');
    })
    .join('\n\n');
}

/**
 * Replaces the values a search invents per call, so re-running the capture does not rewrite the
 * documentation.
 *
 * A FHIR searchset carries a freshly minted Bundle id and the time the search ran. Both change on
 * every run, which made the committed docs dirty after each capture and made a diff look as though
 * the flow had changed when nothing had -- the same reason the redirect chain stopped quoting
 * Keycloak's per-import `execution`. The resource ids inside the entries are left alone: those are
 * the demonstration data, they are stable, and they are what a reader follows between steps.
 */
function stabilize(parsed: unknown): unknown {
  if (parsed && typeof parsed === 'object' && (parsed as { resourceType?: string }).resourceType === 'Bundle') {
    const bundle = parsed as { id?: string; meta?: { lastUpdated?: string } };

    if (bundle.id) {
      bundle.id = '<bundle id>';
    }

    if (bundle.meta?.lastUpdated) {
      bundle.meta.lastUpdated = '<search timestamp>';
    }
  }

  return parsed;
}

/** Pretty-prints JSON so a reader can find a claim in it, and truncates anything overlong. */
function body(raw: string, contentType = ''): string {
  let text = raw;

  if (/json/.test(contentType)) {
    try {
      text = JSON.stringify(stabilize(JSON.parse(raw)), null, 2);
    } catch {
      // Not JSON after all; quote it as it arrived.
    }
  } else if (/x-www-form-urlencoded/.test(contentType)) {
    // One parameter per line. A token request posted as a single line is unreadable, and it is the
    // block an implementer most needs to copy.
    text = raw.split('&').join('\n');
  }

  if (text.length <= MAX_BODY) {
    return text;
  }

  return `${text.slice(0, MAX_BODY)}\n… truncated; ${text.length - MAX_BODY} more characters`;
}

function titleCase(header: string): string {
  return header
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('-');
}

function statusText(status: number): string {
  const known: Record<number, string> = {
    200: 'OK',
    201: 'Created',
    204: 'No Content',
    302: 'Found',
    303: 'See Other',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    500: 'Internal Server Error',
    503: 'Service Unavailable',
  };

  return known[status] ?? '';
}

/**
 * Replaces the generated regions of a document, leaving its prose alone.
 *
 * A step with no marker is reported rather than dropped silently: the whole point of generating this
 * is that it cannot fall behind the code, and a step quietly writing to nowhere would do exactly
 * that.
 */
export function writeBlocks(docPath: string, blocks: Record<string, string>): void {
  let doc = fs.readFileSync(docPath, 'utf8');
  const missing: string[] = [];

  for (const [name, markdown] of Object.entries(blocks)) {
    const region = new RegExp(`(<!-- wire:${name} -->)[\\s\\S]*?(<!-- /wire:${name} -->)`);

    if (!region.test(doc)) {
      missing.push(name);
      continue;
    }

    doc = doc.replace(region, `$1\n\n${markdown}\n\n$2`);
  }

  fs.writeFileSync(docPath, doc);

  if (missing.length > 0) {
    console.warn(`  no <!-- wire:… --> marker in ${docPath} for: ${missing.join(', ')}`);
  }
}
