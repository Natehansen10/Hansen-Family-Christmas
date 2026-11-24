import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const COOKIE = 'mn_session'
const MAX_AGE = 60 * 60 * 24 * 150 // through the season and then some

function secret(): string {
  const s = process.env.SESSION_SECRET
  if (s && s.length >= 16) return s
  if (process.env.VERCEL) throw new ConfigError('SESSION_SECRET is not set (needs 16+ characters).')
  return 'dev-only-secret-not-for-production'
}

export class ConfigError extends Error {}

const sign = (data: string) => createHmac('sha256', secret()).update(data).digest('base64url')

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** httpOnly signed cookie: the device remembers who claimed it. */
export function sessionCookie(personId: string, secure: boolean): string {
  const body = `${personId}.${Math.floor(Date.now() / 1000)}`
  return `${COOKIE}=${body}.${sign(body)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure ? '; Secure' : ''}`
}

export function clearCookie(secure: boolean): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`
}

export function readSession(req: Request): string | null {
  const raw = req.headers.get('cookie') ?? ''
  const hit = raw.split(/;\s*/).find((c) => c.startsWith(COOKIE + '='))
  if (!hit) return null
  const parts = hit.slice(COOKIE.length + 1).split('.')
  if (parts.length !== 3) return null
  const [pid, iat, sig] = parts
  if (!safeEqual(sig, sign(`${pid}.${iat}`))) return null
  if (Date.now() / 1000 - Number(iat) > MAX_AGE) return null
  return pid
}

export const isVaultCode = (v: unknown): v is string => typeof v === 'string' && /^\d{4}$/.test(v)

export function hashVault(code: string): string {
  const salt = randomBytes(16)
  return `scrypt$${salt.toString('base64url')}$${scryptSync(code, salt, 32).toString('base64url')}`
}

export function checkVault(code: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split('$')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const want = Buffer.from(hash, 'base64url')
  const got = scryptSync(code, Buffer.from(salt, 'base64url'), want.length)
  return timingSafeEqual(want, got)
}
