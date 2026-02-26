import http from 'node:http'
import https from 'node:https'

const listenHost = process.env.GOANNA_WEB_HOST ?? '0.0.0.0'
const listenPort = Number.parseInt(process.env.GOANNA_WEB_PORT ?? '9044', 10)

const webTarget = new URL(
  process.env.GOANNA_WEB_INTERNAL_URL ??
    `http://127.0.0.1:${process.env.GOANNA_WEB_INTERNAL_PORT ?? '9045'}`,
)
const apiTarget = new URL(
  process.env.GOANNA_API_INTERNAL_URL ?? 'http://127.0.0.1:8080',
)

if (!Number.isFinite(listenPort) || listenPort <= 0) {
  throw new Error(`Invalid GOANNA_WEB_PORT: ${process.env.GOANNA_WEB_PORT ?? ''}`)
}

const server = http.createServer((incomingRequest, outgoingResponse) => {
  const requestPath = incomingRequest.url ?? '/'
  const destination = pickDestination(requestPath)
  const transport = destination.protocol === 'https:' ? https : http

  const upstreamRequest = transport.request(
    {
      protocol: destination.protocol,
      hostname: destination.hostname,
      port: destination.port,
      method: incomingRequest.method,
      path: requestPath,
      headers: {
        ...incomingRequest.headers,
        host: destination.host,
      },
    },
    (upstreamResponse) => {
      outgoingResponse.writeHead(
        upstreamResponse.statusCode ?? 502,
        upstreamResponse.headers,
      )
      upstreamResponse.pipe(outgoingResponse)
    },
  )

  upstreamRequest.on('error', (error) => {
    if (outgoingResponse.headersSent) {
      outgoingResponse.end()
      return
    }

    outgoingResponse.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
    outgoingResponse.end(`Upstream request failed: ${error.message}`)
  })

  incomingRequest.pipe(upstreamRequest)
})

server.listen(listenPort, listenHost, () => {
  process.stdout.write(
    `[gateway] listening on http://${listenHost}:${listenPort}; web=${webTarget.origin} api=${apiTarget.origin}\n`,
  )
})

process.on('SIGINT', () => server.close(() => process.exit(0)))
process.on('SIGTERM', () => server.close(() => process.exit(0)))

function pickDestination(path) {
  if (
    path === '/healthz' ||
    path === '/v1' ||
    path.startsWith('/v1/') ||
    path.startsWith('/v1?')
  ) {
    return apiTarget
  }

  return webTarget
}
