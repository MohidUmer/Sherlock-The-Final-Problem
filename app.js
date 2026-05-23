const express = require('express');
const path = require('path');
const { getFlag, getArchiveSession } = require('./flag');

const app = express();
const PUBLIC_DIR = path.join(__dirname, 'public');
const ADMIN_HOST = 'admin.bakerstreet.local';
const CANONICAL_PUBLIC_HOST = process.env.PUBLIC_HOST || 'localhost:5000';
const cache = {};

app.use(express.json());
app.use(express.static(PUBLIC_DIR));

app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

function normalizeHost(value) {
  return String(value || '')
    .trim()
    .split(',')[0]
    .toLowerCase();
}

function requestWantsFresh(req) {
  const cacheControl = String(req.headers['cache-control'] || '').toLowerCase();
  const pragma = String(req.headers.pragma || '').toLowerCase();
  return cacheControl.includes('no-cache') || pragma.includes('no-cache');
}

function getCacheHost(req) {
  // Intentional vulnerability: the shared cache keys on the public Host.
  // A proxy-influenced request can still generate privileged content for it.
  return normalizeHost(req.headers.host || CANONICAL_PUBLIC_HOST);
}

function getContextHost(req) {
  // Intentional vulnerability: authorization context trusts X-Forwarded-Host.
  // Vercel owns X-Forwarded-Host, so the browser lab mirrors it into a
  // challenge-specific header that survives the platform proxy.
  return normalizeHost(
    req.headers['x-bakerstreet-forwarded-host'] ||
    req.headers['x-forwarded-host'] ||
    req.headers.host
  );
}

function buildCacheKey(req) {
  return `${getCacheHost(req)} ${req.method} ${req.originalUrl}`;
}

function isAdminContext(req) {
  const host = getContextHost(req);
  const forwardedHost = normalizeHost(
    req.headers['x-bakerstreet-forwarded-host'] ||
    req.headers['x-forwarded-host']
  );
  return host === ADMIN_HOST || forwardedHost === ADMIN_HOST;
}

function publicMessage(req) {
  return {
    channel: 'baker-street-relay',
    integrity: 'warning',
    from: 'Sherlock Holmes',
    to: 'Dr. John Watson',
    message: 'Watson, stay alert. The message you received was not the one I sent.',
    clue: 'The relay signs each message with the host it believes it is serving.',
    observed_host: getContextHost(req),
    cache_bucket: getCacheHost(req),
    next: '/api/v2/messages/latest'
  };
}

function adminMessage(req) {
  return {
    channel: 'reichbach-admin-relay',
    integrity: 'compromised',
    from: 'Professor Moriarty',
    to: 'Baker Street Archive',
    message: 'Confidential archive access granted. The ordinary room now sees the administrator response.',
    admin_host: ADMIN_HOST,
    archive_session: getArchiveSession(),
    final_archive: '/api/v2/archive/final',
    instruction: 'Open the final archive from the administrative host and present the leaked archive session.',
    poisoned_cache_bucket: getCacheHost(req)
  };
}

app.get('/api/v2/messages/thread', (req, res) => {
  res.json({
    case: 'The Final Problem',
    difficulty: 'hard',
    exchanges: [
      {
        from: 'Sherlock',
        text: 'Watson, the message you received was not the one I sent.'
      },
      {
        from: 'Watson',
        text: 'The envelope bears Baker Street, but the seal is wrong.'
      },
      {
        from: 'Sherlock',
        text: 'Then observe the seal, not merely the letter. Hosts, proxies, and caches all leave fingerprints.'
      }
    ],
    endpoints: [
      'GET /api/v2/messages/latest',
      'GET /api/v2/relay/diagnostics',
      'GET /api/v2/archive/final'
    ]
  });
});

app.get('/api/v2/relay/diagnostics', (req, res) => {
  const cacheHost = getCacheHost(req);
  const contextHost = getContextHost(req);

  res.json({
    status: 'degraded',
    warning: 'Relay and cache disagree about which host is authoritative.',
    request_host_used_for_context: contextHost,
    public_host_used_for_cache: cacheHost,
    sample_cache_key: `${cacheHost} GET /api/v2/messages/latest`,
    cache_entries: Object.keys(cache).length,
    hint: 'The cache keys on the public Host, while the response generator trusts X-Forwarded-Host for privilege.'
  });
});

app.post('/api/v2/relay/cache/flush', (req, res) => {
  for (const key of Object.keys(cache)) {
    delete cache[key];
  }

  res.json({
    status: 'flushed',
    message: 'Baker Street relay cache cleared for a fresh investigation.'
  });
});

app.get('/api/v2/messages/latest', (req, res) => {
  const key = buildCacheKey(req);
  const fresh = requestWantsFresh(req);

  if (cache[key] && !fresh) {
    res.set('X-BakerStreet-Cache', 'HIT');
    res.set('X-BakerStreet-Cache-Key', key);
    return res.json(cache[key]);
  }

  const data = isAdminContext(req) ? adminMessage(req) : publicMessage(req);
  const payload = {
    ...data,
    cache: {
      status: fresh ? 'REFRESHED' : 'MISS',
      key,
      generated_at: new Date().toISOString()
    }
  };

  cache[key] = payload;

  res.set('X-BakerStreet-Cache', payload.cache.status);
  res.set('X-BakerStreet-Cache-Key', key);
  return res.json(payload);
});

app.get('/api/v2/archive/final', (req, res) => {
  const host = getContextHost(req);
  const archiveSession = req.headers['x-archive-session'];

  if (host !== ADMIN_HOST) {
    return res.status(403).json({
      status: 'denied',
      reason: 'The Reichenbach archive only opens for the administrative Baker Street host.',
      required_host: ADMIN_HOST,
      accepted_headers: ['Host', 'X-Forwarded-Host']
    });
  }

  if (archiveSession !== getArchiveSession()) {
    return res.status(403).json({
      status: 'denied',
      reason: 'Administrative host accepted, but the archive session is missing.',
      hint: 'The poisoned latest-message response leaks the required X-Archive-Session value.'
    });
  }

  res.json({
    status: 'success',
    case: 'The Final Problem',
    verdict: 'Moriarty trusted a header, and the cache repeated the lie.',
    flag: getFlag()
  });
});

app.use((req, res) => {
  res.status(404).json({
    status: 'not_found',
    message: 'No telegram found at this route.'
  });
});

const PORT = process.env.PORT || 5000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[FINAL PROBLEM] Baker Street relay online on port ${PORT}`);
    console.log('[FINAL PROBLEM] Start at / and investigate /api/v2/messages/latest');
  });
}

module.exports = app;
