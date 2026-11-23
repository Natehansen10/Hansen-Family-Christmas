import { lookup as dnsLookup } from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import { isIP } from 'node:net'
import type { Unfurled } from '../shared/types.js'

const TIMEOUT_MS = 6000
const MAX_BYTES = 1_500_000
const MAX_REDIRECTS = 4
const UA = 'Mozilla/5.0 (compatible; MaisonNoelBot/1.0; link preview)'

/** True for any address a link preview must never touch: loopback, private, link-local, metadata, CGNAT, multicast. */
export function isBlockedAddress(addr: string): boolean {
  const v = isIP(addr)
  if (v === 4) return blockedV4(addr)
  if (v === 6) return blockedV6(addr)
  return true
}

function blockedV4(addr: string): boolean {
  const [a, b] = addr.split('.').map(Number)
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local and cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  )
}

function blockedV6(addr: string): boolean {
  const a = addr.toLowerCase().split('%')[0]
  if (a === '::' || a === '::1') return true
  const dotted = a.match(/(\d+\.\d+\.\d+\.\d+)$/)
  if (dotted && (a.startsWith('::ffff:') || a.startsWith('::') || a.startsWith('64:ff9b:'))) return blockedV4(dotted[1])
  const hexMapped = a.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (hexMapped) {
    const hi = parseInt(hexMapped[1], 16)
    const lo = parseInt(hexMapped[2], 16)
    return blockedV4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`)
  }
  const first = parseInt(a.split(':')[0] || '0', 16)
  return (
    (first & 0xfe00) === 0xfc00 || // unique local fc00::/7
    (first & 0xffc0) === 0xfe80 || // link-local fe80::/10
    (first & 0xff00) === 0xff00 || // multicast
    a.startsWith('2001:db8:') ||
    a.startsWith('64:ff9b:')
  )
}

export class UnfurlError extends Error {}

export function assertPublicUrl(raw: string): URL {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    throw new UnfurlError('That does not look like a link.')
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new UnfurlError('Only http and https links work.')
  if (u.username || u.password) throw new UnfurlError('Links with credentials are not allowed.')
  if (u.port && u.port !== '80' && u.port !== '443') throw new UnfurlError('That port is not allowed.')
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (isIP(host) && isBlockedAddress(host)) throw new UnfurlError('That address is not allowed.')
  if (/^(localhost|.*\.(local|internal|localhost))$/i.test(host)) throw new UnfurlError('That address is not allowed.')
  return u
}

interface FetchOpts {
  /** tests only: lets the suite hit a server on 127.0.0.1 */
  allowPrivate?: boolean
}

/**
 * The address check runs inside the socket's DNS lookup, so the IP that was
 * validated is the IP that gets connected to. No rebinding window.
 */
function guardedLookup(allowPrivate: boolean) {
  return (hostname: string, options: object, cb: (err: Error | null, address?: unknown, family?: number) => void) => {
    dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return cb(err)
      const list = addresses as { address: string; family: number }[]
      if (!list.length) return cb(new UnfurlError('Could not find that site.'))
      if (!allowPrivate && list.some((x) => isBlockedAddress(x.address))) return cb(new UnfurlError('That address is not allowed.'))
      if ((options as { all?: boolean }).all) cb(null, list)
      else cb(null, list[0].address, list[0].family)
    })
  }
}

function getOnce(u: URL, opts: FetchOpts): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const mod = u.protocol === 'https:' ? https : http
    const req = mod.request(
      u,
      {
        method: 'GET',
        timeout: TIMEOUT_MS,
        lookup: guardedLookup(!!opts.allowPrivate) as never,
        headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-US,en;q=0.8' },
      },
      (res) => {
        const status = res.statusCode ?? 0
        const type = String(res.headers['content-type'] ?? '')
        if (status >= 300 && status < 400) {
          res.resume()
          return resolve({ status, headers: res.headers, body: '' })
        }
        if (!/html|xml/i.test(type)) {
          res.destroy()
          return resolve({ status, headers: res.headers, body: '' })
        }
        const chunks: Buffer[] = []
        let size = 0
        res.on('data', (c: Buffer) => {
          size += c.length
          chunks.push(c)
          if (size > MAX_BYTES) res.destroy()
        })
        const done = () => resolve({ status, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') })
        res.on('end', done)
        res.on('close', done)
        res.on('error', done)
      },
    )
    req.on('timeout', () => req.destroy(new UnfurlError('The store took too long to answer.')))
    req.on('error', reject)
    req.end()
  })
}

async function fetchHtml(start: URL, opts: FetchOpts): Promise<string> {
  let u = start
  const deadline = Date.now() + TIMEOUT_MS
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (Date.now() > deadline) throw new UnfurlError('The store took too long to answer.')
    const res = await getOnce(u, opts)
    const loc = res.headers.location
    if (res.status >= 300 && res.status < 400 && loc) {
      const next = new URL(loc, u)
      u = opts.allowPrivate ? next : assertPublicUrl(next.href) // every hop is re-checked
      continue
    }
    return res.status >= 200 && res.status < 300 ? res.body : ''
  }
  throw new UnfurlError('Too many redirects.')
}

const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

export function toCents(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.]/g, ''))
  if (!Number.isFinite(n) || n <= 0 || n > 100_000) return null
  return Math.round(n * 100)
}

export function storeFromHost(host: string): string {
  const parts = host.replace(/^(www|m|shop|store)\./, '').split('.')
  const core = parts.length > 1 ? parts[parts.length - 2] : parts[0]
  const known: Record<string, string> = { rei: 'REI', lego: 'LEGO', ikea: 'IKEA', hm: 'H&M', bestbuy: 'Best Buy', llbean: 'L.L.Bean', jcrew: 'J.Crew' }
  return known[core] ?? core.charAt(0).toUpperCase() + core.slice(1)
}

/** Pulls title, image, price and store out of a product page. Pure, so it is easy to test. */
export function parseHtml(html: string, pageUrl: URL): Unfurled {
  const meta = new Map<string, string>()
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = tag.match(/\b(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase()
    const val = tag.match(/\bcontent\s*=\s*"([^"]*)"/i)?.[1] ?? tag.match(/\bcontent\s*=\s*'([^']*)'/i)?.[1]
    if (key && val && !meta.has(key)) meta.set(key, decode(val))
  }

  let ldName: string | null = null
  let ldImage: string | null = null
  let ldPrice: unknown = null
  for (const m of html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const stack: unknown[] = [JSON.parse(m[1])]
      while (stack.length) {
        const node = stack.pop()
        if (Array.isArray(node)) stack.push(...node)
        else if (node && typeof node === 'object') {
          const o = node as Record<string, unknown>
          if (Array.isArray(o['@graph'])) stack.push(...o['@graph'])
          const type = ([] as unknown[]).concat(o['@type'] ?? [])
          if (type.includes('Product')) {
            ldName ??= typeof o.name === 'string' ? o.name : null
            const img = Array.isArray(o.image) ? o.image[0] : o.image
            ldImage ??= typeof img === 'string' ? img : ((img as { url?: string } | undefined)?.url ?? null)
            const offer = (Array.isArray(o.offers) ? o.offers[0] : o.offers) as Record<string, unknown> | undefined
            ldPrice ??= offer?.price ?? offer?.lowPrice ?? null
          }
        }
      }
    } catch {
      /* stores ship broken JSON-LD all the time */
    }
  }

  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  const title = meta.get('og:title') ?? ldName ?? meta.get('twitter:title') ?? (titleTag ? decode(titleTag) : null)
  const rawImage = meta.get('og:image:secure_url') ?? meta.get('og:image') ?? ldImage ?? meta.get('twitter:image') ?? null
  let imageUrl: string | null = null
  if (rawImage) {
    try {
      const abs = new URL(rawImage, pageUrl)
      if (abs.protocol === 'https:') imageUrl = abs.href
    } catch {
      /* ignore */
    }
  }
  const price = meta.get('product:price:amount') ?? meta.get('og:price:amount') ?? meta.get('price') ?? ldPrice

  return {
    url: pageUrl.href,
    title: title ? title.slice(0, 200) : null,
    imageUrl,
    store: (meta.get('og:site_name') ?? storeFromHost(pageUrl.hostname)).slice(0, 80),
    priceCents: toCents(price),
  }
}

async function microlink(u: URL): Promise<Partial<Unfurled>> {
  try {
    const res = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(u.href)}`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return {}
    const { data } = (await res.json()) as { data?: { title?: string; image?: { url?: string }; publisher?: string } }
    return { title: data?.title ?? null, imageUrl: data?.image?.url?.startsWith('https:') ? data.image.url : null, store: data?.publisher ?? null }
  } catch {
    return {}
  }
}

/**
 * Never throws for a store that blocks scraping (Amazon often does): the
 * caller always gets at least the store name, and the form is editable.
 */
export async function unfurl(raw: string, opts: FetchOpts & { fallback?: boolean } = {}): Promise<Unfurled> {
  const u = opts.allowPrivate ? new URL(raw) : assertPublicUrl(raw)
  let out: Unfurled = { url: u.href, title: null, imageUrl: null, store: storeFromHost(u.hostname), priceCents: null }
  try {
    const html = await fetchHtml(u, opts)
    if (html) out = parseHtml(html, u)
  } catch (e) {
    if (e instanceof UnfurlError && /not allowed/.test(e.message)) throw e
  }
  if (!out.title && opts.fallback !== false && !opts.allowPrivate) {
    const m = await microlink(u)
    out = { ...out, title: m.title ?? out.title, imageUrl: out.imageUrl ?? m.imageUrl ?? null, store: out.store ?? m.store ?? null }
  }
  return out
}
