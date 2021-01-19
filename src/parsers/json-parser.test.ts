import { expect } from 'chai'
import { Response } from 'cross-fetch'
import fetchMock from 'fetch-mock'
import {} from 'mocha'

import { URL } from '../url'
import { JsonParser } from './json-parser'

describe('JsonParser', () => {
  it('finds a URL in the json body', async () => {
    const parser = new JsonParser({
      include: ["all"]
    })

    const { req, resp } = await makeResp(
      'https://some-json.com',
      '{ "data": [{"url": "https://google.com"}] }',
    )

    const results: URL[] = []
    await parser.parse(resp, req, (result) => results.push(result))

    expect(results.map((r) => r.toString())).to.deep.eq([
      'https://google.com/'
    ])
  })

  it('finds non-relative URLs in some json', async () => {
    const parser = new JsonParser({
      include: ["all"]
    })

    const { req, resp } = await makeResp(
      'https://some-json.com/some-path',
      '[{"url": "/other-path"}]',
    )
    const results: URL[] = []
    await parser.parse(resp, req, (result) => results.push(result))

    expect(results.map((r) => r.toString())).to.deep.eq([
      'https://some-json.com/other-path'
    ])
  })

  it('handles protocol relative URLs', async () => {
    const parser = new JsonParser({
      include: ["all"]
    })

    const { req, resp } = await makeResp(
      'https://some-json.com/some-path',
      '["//images.ctfassets.net/asdf.png"]',
    )
    const results: URL[] = []
    await parser.parse(resp, req, (result) => results.push(result))

    expect(results.map((r) => r.toString())).to.deep.eq([
      'https://images.ctfassets.net/asdf.png'
    ])
  })

  it('handles URLs in whitespace', async () => {
    const parser = new JsonParser({
      include: ["all"]
    })

    const { req, resp } = await makeResp(
      'https://some-json.com/some-path',
      '{ "url": "  http://images.ctfassets.net/asdf.png  " }',
    )
    const results: URL[] = []
    await parser.parse(resp, req, (result) => results.push(result))


    expect(results.map((r) => r.toString())).to.deep.eq([
      'http://images.ctfassets.net/asdf.png'
    ])
  })

  it('by default scans only "links" and "_links" objects', async () => {
    const data = {
      data: {
        slug: '/test-slug',
        links: { self: "/some-rel-link" },
        _links: {
          other: "/some-other-rel-link",
          google: "https://www.google.com"
        }
      },
      _links: {
        thirdLink: '/some-third-link'
      }
    }

    const parser = new JsonParser({
    })

    const { req, resp } = await makeResp(
      'https://some-json.com/some-path',
      JSON.stringify(data),
    )
    const results: URL[] = []
    await parser.parse(resp, req, (result) => results.push(result))

    // order doesn't matter in these results
    const sorted = results.map(r => r.toString()).sort()
    expect(sorted).to.deep.eq([
      'https://some-json.com/some-other-rel-link',
      'https://some-json.com/some-rel-link',
      'https://some-json.com/some-third-link',
      "https://www.google.com/",
    ])
  })
})

async function makeResp(url: string, response: string): Promise<{ req: Request, resp: Response }> {
  const sandbox = fetchMock.sandbox()

  sandbox.get(url, {
    body: response,
    headers: {
      'content-type': 'application/json',
    },
  })

  const req = new Request(url)
  const resp = await sandbox(req)
  return { req, resp }
}
