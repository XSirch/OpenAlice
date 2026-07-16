import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { userDataHome } from './paths.js'

const secretPath = () => resolve(userDataHome, 'connector-inbound.key')

async function secret(): Promise<Buffer> {
  try { return Buffer.from((await readFile(secretPath(), 'utf8')).trim(), 'base64') } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    const value = randomBytes(32)
    await mkdir(dirname(secretPath()), { recursive: true })
    await writeFile(secretPath(), `${value.toString('base64')}\n`, { mode: 0o600 })
    await chmod(secretPath(), 0o600).catch(() => undefined)
    return value
  }
}

export async function signConnectorInbound(correlationId: string, body: string): Promise<string> {
  return createHmac('sha256', await secret()).update(`${correlationId}\n${body}`, 'utf8').digest('base64url')
}

export async function verifyConnectorInbound(correlationId: string, body: string, signature: string | undefined): Promise<boolean> {
  if (!signature) return false
  const expected = Buffer.from(await signConnectorInbound(correlationId, body))
  const actual = Buffer.from(signature)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
