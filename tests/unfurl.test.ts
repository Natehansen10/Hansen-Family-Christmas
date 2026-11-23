import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { assertPublicUrl, isBlockedAddress, parseHtml, storeFromHost, toCents, unfurl } from '../server/unfurl.js'

describe('SSRF guard', () => {
  it('blocks private, loopback, link-local and metadata addresses', () => {
    const blocked = [
      '127.0.0.1', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1',
      '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', '64:ff9b::a00:1', 'not-an-ip',
    ]
    for (const a of blocked) expect(isBlockedAddress(a), a).toBe(true)
  })

  it('allows public addresses', () => {
    for (const a of ['8.8.8.8', '151.101.1.67', '172.32.0.1', '2606:4700:4700::1111']) expect(isBlockedAddress(a), a).toBe(false)
  })

  it('rejects dangerous URLs before any request is made', () => {
    const bad = [
      'file:///etc/passwd', 'ftp://example.com', 'http://localhost/', 'http://127.0.0.1/', 'http://[::1]/', 'http://169.254.169.254/latest/meta-data/',
      'http://10.0.0.1/', 'https://user:pass@example.com/', 'https://example.com:8080/', 'http://db.internal/', 'nonsense',
    ]
    for (const u of bad) expect(() => assertPublicUrl(u), u).toThrow()
    expect(assertPublicUrl('https://www.rei.com/product/1').hostname).toBe('www.rei.com')
  })
})

describe('parsing a product page', () => {
  const page = `<html><head><title>Fallback &amp; title</title>
    <meta property="og:title" content="Garmin Forerunner 965 &quot;Carbon&quot;">
    <meta property="og:image" content="/img/watch.jpg">
    <meta property="og:site_name" content="REI Co-op">
    <meta property="product:price:amount" content="599.99">
    </head></html>`

  it('reads Open Graph', () => {
    expect(parseHtml(page, new URL('https://www.rei.com/p/1'))).toEqual({
      url: 'https://www.rei.com/p/1',
      title: 'Garmin Forerunner 965 "Carbon"',
      imageUrl: 'https://www.rei.com/img/watch.jpg',
      store: 'REI Co-op',
      priceCents: 59999,
    })
  })

  it('falls back to JSON-LD, then the title tag, then the hostname', () => {
    const ld = `<script type="application/ld+json">{"@graph":[{"@type":"Product","name":"Dutch Oven","image":["https://cdn.x.com/a.jpg"],"offers":{"price":"420.00"}}]}</script>`
    expect(parseHtml(ld, new URL('https://www.lecreuset.com/p'))).toMatchObject({ title: 'Dutch Oven', imageUrl: 'https://cdn.x.com/a.jpg', priceCents: 42000, store: 'Lecreuset' })
    expect(parseHtml('<title> Just a title </title>', new URL('https://shop.lego.com/x'))).toMatchObject({ title: 'Just a title', store: 'LEGO', priceCents: null })
  })

  it('drops insecure images and silly prices', () => {
    expect(parseHtml('<meta property="og:image" content="http://x.com/a.png">', new URL('https://x.com')).imageUrl).toBeNull()
    expect(toCents('$1,299.00')).toBe(129900)
    expect(toCents('free')).toBeNull()
    expect(toCents(0)).toBeNull()
    expect(storeFromHost('www.amazon.com')).toBe('Amazon')
  })
})

describe('fetching', () => {
  let server: http.Server
  let base: string
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/hop') return void res.writeHead(302, { location: '/product' }).end()
      if (req.url === '/loop') return void res.writeHead(302, { location: '/loop' }).end()
      if (req.url === '/pdf') return void res.writeHead(200, { 'content-type': 'application/pdf' }).end('%PDF')
      if (req.url === '/blocked') return void res.writeHead(503, { 'content-type': 'text/html' }).end('robot check')
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end('<meta property="og:title" content="Wooden Play Kitchen"><meta property="og:price:amount" content="130">')
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(() => server.close())

  it('follows redirects and parses the page', async () => {
    expect(await unfurl(`${base}/hop`, { allowPrivate: true })).toMatchObject({ title: 'Wooden Play Kitchen', priceCents: 13000 })
  })

  it('degrades to a blank, editable result when a store blocks scraping', async () => {
    for (const path of ['/blocked', '/pdf', '/loop']) {
      expect(await unfurl(`${base}${path}`, { allowPrivate: true }), path).toMatchObject({ title: null, priceCents: null })
    }
  })

  it('will not touch the same server without the test-only override', async () => {
    await expect(unfurl(`${base}/product`, { fallback: false })).rejects.toThrow(/not allowed/)
  })
})
