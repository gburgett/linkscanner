import { expect } from 'chai'
import { Response } from 'cross-fetch'
import {} from 'mocha'
import { URL } from '../url'

import { PassThrough, Readable } from 'stream'
import { JsonParser } from './json-parser'

describe('JsonParser', () => {
  it('finds a URL in the json body', async () => {
    const parser = new JsonParser()

    const req = new Request('https://some-json.com')
    const resp = new Response(toStream('{ "data": [{"url": "https://google.com"}] }'), {
      headers: {
        'content-type':  'application/json',
      },
    })
    const results: URL[] = []
    await parser.parse(resp, req, (result) => results.push(result))

    expect(results.length).to.eq(1)
    expect(results[0].toString()).to.eq('https://google.com/')
  })

  it('finds non-relative URLs in some json', async () => {
    const parser = new JsonParser()

    const req = new Request('https://some-json.com/some-path')
    const resp = new Response(toStream('[{"url": "/other-path"}]'), {
      headers: {
        'content-type': 'application/json',
      },
    })
    const results: URL[] = []
    await parser.parse(resp, req, (result) => results.push(result))

    expect(results.length).to.eq(1)
    expect(results[0].toString()).to.eq('https://some-json.com/other-path')
  })

  it('handles protocol relative URLs', async () => {
    const parser = new JsonParser()

    const req = new Request('https://some-json.com/some-path')
    const resp = new Response(toStream('["//images.ctfassets.net/asdf.png"]'), {
      headers: {
        'content-type': 'application/json',
      },
    })
    const results: URL[] = []
    await parser.parse(resp, req, (result) => results.push(result))

    expect(results.length).to.eq(1)
    expect(results[0].toString()).to.eq('https://images.ctfassets.net/asdf.png')
  })

  it('handles URLs in whitespace', async () => {
    const parser = new JsonParser()

    const req = new Request('https://some-json.com/some-path')
    const resp = new Response(toStream('{ "url": "\thttp://images.ctfassets.net/asdf.png  " }'), {
      headers: {
        'content-type': 'application/json',
      },
    })
    const results: URL[] = []
    await parser.parse(resp, req, (result) => results.push(result))

    expect(results.length).to.eq(1)
    expect(results[0].toString()).to.eq('http://images.ctfassets.net/asdf.png')
  })
})

function toStream(string: string): ReadableStream<Uint8Array> {
  const s = new PassThrough()
  s.write(Buffer.from(string))
  s.end()
  return s as any
}
