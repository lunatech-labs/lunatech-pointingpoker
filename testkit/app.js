// Starts the staged launcher rather than `sbt run`: it boots in about two seconds, it is a
// single process so teardown is a clean signal, and it is the same artifact Docker ships.
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const launcher = path.join(repoRoot, 'target', 'universal', 'stage', 'bin', 'pointingpoker')
const indexPath = path.join(repoRoot, 'src', 'main', 'resources', 'pages', 'index.html')

const READY_TIMEOUT_MS = 30_000
const STAGE_COMMAND = 'sbt "; coverageOff; Universal/stage"'

// SseConfig.load's `require`s validate this at startup, so the profile does not get its own
// copy of the rules. The heartbeat is hardcoded at 15s and cannot be turned down.
export const testProfile = {
  SSE_GRACE_PERIOD: '4s',
  SSE_RETRY: '200ms'
}

export async function freePort() {
  const server = net.createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address()
  server.close()
  await once(server, 'close')
  return port
}

export async function startApp({ port, env = {} } = {}) {
  // Fail here rather than spending the readiness cap on a file that is not there.
  if (!fs.existsSync(launcher)) {
    throw new Error(`${launcher} is missing. Run: ${STAGE_COMMAND}`)
  }
  const chosen = port ?? (await freePort())
  const child = spawn(launcher, [], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      HOST: 'localhost',
      PORT: String(chosen),
      // Without this the browser never returns the session cookie over plain HTTP and
      // every case fails with a 401 that looks like a session bug.
      SECURE_COOKIES: 'false',
      // application.conf's default is repo-relative and the staged binary does not run
      // from the repo root.
      INDEX_PATH: indexPath,
      ...testProfile,
      ...env
    }
  })

  const captured = []
  child.stdout.on('data', chunk => captured.push(chunk))
  child.stderr.on('data', chunk => captured.push(chunk))
  const output = () => Buffer.concat(captured).toString()

  let exited = null
  let spawnError = null
  child.on('exit', (code, signal) => {
    exited = { code, signal }
  })
  // A launcher that exists but cannot be run emits 'error' and may never emit 'exit', so
  // without this both the readiness loop and stop() would hang on a process that never was.
  child.on('error', error => {
    spawnError = error
    exited ??= { code: null, signal: null }
  })

  const failure = () => {
    if (spawnError) return `${launcher} could not be spawned: ${spawnError.message}`
    if (exited) return `the app exited before it became ready (code ${exited.code}, signal ${exited.signal})`
    return null
  }

  const stop = async () => {
    if (exited) return
    if (!child.kill('SIGTERM')) return
    const hard = setTimeout(() => child.kill('SIGKILL'), 2000)
    await once(child, 'exit')
    clearTimeout(hard)
  }

  const baseUrl = `http://localhost:${chosen}`
  try {
    await waitForReady(baseUrl, failure)
  } catch (reason) {
    // A config error looks identical to a slow machine without the captured output.
    const log = output()
    await stop()
    throw new Error(`${reason.message}\n--- app output ---\n${log}`)
  }
  return { baseUrl, port: chosen, output, stop }
}

async function waitForReady(baseUrl, failure) {
  const deadline = Date.now() + READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    const reason = failure()
    if (reason) throw new Error(reason)
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(1000) })
      if (response.ok) {
        await response.arrayBuffer()
        return
      }
    } catch {
      // Not up yet; the loop's own deadline is the only thing that gives up.
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`the app did not answer on ${baseUrl} within ${READY_TIMEOUT_MS}ms`)
}
