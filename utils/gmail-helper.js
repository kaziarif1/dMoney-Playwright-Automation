const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const POLL_INTERVAL_MS = 3_000;
const OTP_TIMEOUT_MS = 120_000;
const RESET_TIMEOUT_MS = 5 * 60_000;

function validateGmailConfig() {
  const names = [
    'DMONEY_TEST_GMAIL',
    'DMONEY_GMAIL_CLIENT_ID',
    'DMONEY_GMAIL_CLIENT_SECRET',
    'DMONEY_GMAIL_REFRESH_TOKEN',
  ];
  const missing = names.filter(name => !process.env[name]?.trim());
  if (missing.length) {
    throw new Error(`Configure ${missing.join(', ')} in the local .env for Gmail read-only access.`);
  }
  if (!/^[^@\s]+@gmail\.com$/i.test(process.env.DMONEY_TEST_GMAIL.trim())) {
    throw new Error('DMONEY_TEST_GMAIL must be the Gmail inbox authorized for this test.');
  }
}

function gmailConfig() {
  validateGmailConfig();
  const names = [
    'DMONEY_TEST_GMAIL',
    'DMONEY_GMAIL_CLIENT_ID',
    'DMONEY_GMAIL_CLIENT_SECRET',
    'DMONEY_GMAIL_REFRESH_TOKEN',
  ];
  return Object.fromEntries(names.map(name => [name, process.env[name].trim()]));
}

async function requestJson(url, options, failureMessage) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error(`${failureMessage} (Gmail request could not be completed).`);
  }
  if (!response.ok) {
    throw new Error(`${failureMessage} (Gmail returned HTTP ${response.status}; check OAuth setup and Gmail API access).`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error(`${failureMessage} (Gmail returned an unreadable response).`);
  }
}

async function getAccessToken(config) {
  const body = new URLSearchParams({
    client_id: config.DMONEY_GMAIL_CLIENT_ID,
    client_secret: config.DMONEY_GMAIL_CLIENT_SECRET,
    refresh_token: config.DMONEY_GMAIL_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  });
  const result = await requestJson(
    GOOGLE_TOKEN_URL,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    },
    'Could not authorize Gmail read-only access'
  );
  if (!result.access_token) {
    throw new Error('Google did not issue a Gmail access token; check the local OAuth client and refresh-token authorization.');
  }
  return result.access_token;
}

function decodePart(data) {
  return data ? Buffer.from(data, 'base64url').toString('utf8') : '';
}

function collectBody(payload) {
  if (!payload) return '';
  const ownBody = decodePart(payload.body?.data);
  return [
    ownBody,
    ...(payload.parts || []).map(collectBody),
  ].join('\n');
}

function headerMap(payload) {
  return Object.fromEntries((payload?.headers || []).map(({ name, value }) =>
    [name.toLowerCase(), value]));
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x2f;|&#47;/gi, '/')
    .replace(/&#x3d;|&#61;/gi, '=');
}

function emailText(body) {
  return decodeHtml(body.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ');
}

function recipientMatches(headers, recipient) {
  const values = ['to', 'cc', 'delivered-to', 'x-original-to']
    .map(name => headers[name])
    .filter(Boolean);
  const addresses = values.flatMap(value =>
    value.match(/[^\s<>,;]+@[^\s<>,;]+/g) || []);
  return !addresses.length ||
    addresses.some(address => address.toLowerCase() === recipient.toLowerCase());
}

function isDmoneyEmail(headers, body) {
  return /dmoney|roadtocareer\.net/i.test(
    `${headers.from || ''} ${headers.subject || ''} ${body}`
  );
}

function extractOtp(text) {
  const patterns = [
    /\b(?:otp|one[-\s]?time password|verification code)\b[^\d]{0,40}(\d{4})\b/i,
    /\b(\d{4})\b[^\w]{0,20}\b(?:is your )?(?:otp|verification code)\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function extractResetUrl(body) {
  const candidates = [...body.matchAll(/https?:\/\/[^\s"'<>]+/gi)]
    .map(match => decodeHtml(match[0]).replace(/[),.;]+$/g, ''));
  for (const candidate of candidates) {
    let url;
    try {
      url = new URL(candidate);
    } catch {
      continue;
    }
    if (
      url.protocol === 'https:' &&
      url.origin === 'https://dmoneyportal.roadtocareer.net' &&
      url.pathname === '/reset-password'
    ) {
      return url.toString();
    }
  }
  return null;
}

async function listRecentMessages(accessToken, recipient, afterMs) {
  const query = new URLSearchParams({
    q: `after:${Math.floor(afterMs / 1_000)} to:${recipient}`,
    maxResults: '10',
  });
  const result = await requestJson(
    `${GMAIL_API}/messages?${query}`,
    { headers: { authorization: `Bearer ${accessToken}` } },
    'Could not search the Gmail inbox'
  );
  return result.messages || [];
}

async function getMessage(accessToken, id) {
  return requestJson(
    `${GMAIL_API}/messages/${encodeURIComponent(id)}?format=full`,
    { headers: { authorization: `Bearer ${accessToken}` } },
    'Could not read a matching Gmail message'
  );
}

async function verifyGmailAccess() {
  const config = gmailConfig();
  const accessToken = await getAccessToken(config);
  await requestJson(
    `${GMAIL_API}/messages?maxResults=1`,
    { headers: { authorization: `Bearer ${accessToken}` } },
    'Could not verify Gmail read-only inbox access'
  );
}

async function findEmailValue({ recipient, afterMs, timeoutMs, kind, extract }) {
  const config = gmailConfig();
  const accessToken = await getAccessToken(config);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const messages = await listRecentMessages(accessToken, recipient, afterMs);
    const fullMessages = await Promise.all(messages.map(message => getMessage(accessToken, message.id)));
    for (const message of fullMessages) {
      const internalDate = Number(message.internalDate);
      if (!Number.isFinite(internalDate) || internalDate < afterMs) continue;

      const headers = headerMap(message.payload);
      if (!recipientMatches(headers, recipient)) continue;
      const body = collectBody(message.payload);
      if (!isDmoneyEmail(headers, body)) continue;

      const value = extract(`${headers.subject || ''}\n${emailText(body)}`, body);
      if (value) return value;
    }
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`Timed out after ${Math.round(timeoutMs / 1_000)} seconds waiting for the new dMoney ${kind} email for the Agent account.`);
}

function waitForDmoneyOtp(recipient, afterMs) {
  return findEmailValue({
    recipient,
    afterMs,
    timeoutMs: OTP_TIMEOUT_MS,
    kind: 'OTP',
    extract: text => extractOtp(text),
  });
}

function waitForAgentResetUrl(recipient, afterMs) {
  return findEmailValue({
    recipient,
    afterMs,
    timeoutMs: RESET_TIMEOUT_MS,
    kind: 'password-reset',
    extract: (_text, body) => extractResetUrl(body),
  });
}

module.exports = { verifyGmailAccess, waitForAgentResetUrl, waitForDmoneyOtp };
