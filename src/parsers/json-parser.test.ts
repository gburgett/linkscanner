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

  it('handles links in papyrus', async () => {
    const data = `{
  "key": "paper_signs",
  "items": [
    {
      "id": "7E2dEfvJMjgVumlQMbBQcx",
      "slug": "/mentoring-during-covid",
      "heroImage": {
        "id": "d06eebb7-6790-5b46-beee-ace4f3e874e2",
        "contentful_id": "28laOpGCovafkvHl6VHuh0",
        "node_locale": "en-US",
        "title": "Serah Luu - Hero Image",
        "file": {
          "contentType": "image/jpeg",
          "details": {
            "size": 382788,
            "image": {
              "width": 1920,
              "height": 1080
            }
          },
          "fileName": "_DSC0986.jpg",
          "url": "//images.ctfassets.net/lwoaet07hh7w/28laOpGCovafkvHl6VHuh0/be4565eec1fadd06374c1c2e7611704c/_DSC0986.jpg"
        }
      },
      "_links": {
        "self": "/api/v1/blog/mentoring-during-covid/2fe48e32b5a5e179b2222281bdb24d2315a65d34.json",
        "fragment": "/blog/mentoring-during-covid/2fe48e32b5a5e179b2222281bdb24d2315a65d34.fragment"
      }
    }
  ],
  "_links": {
    "self": "/api/v1/property/paper_signs/blog/1/f0fd7e9fb40c3e84770bd2bbc8b510780eb3e2d1.json",
    "next": "/api/v1/property/paper_signs/blog/2/66fa1b1bd647052f05a5986b1737d21393d4aabd.json",
    "last": "/api/v1/property/paper_signs/blog/18/66463ba9bb407cc00c3b1c922deca6d8537f3d10.json"
  }
}`

    const parser = new JsonParser({
      include: ['$..url']
    })

    const { req, resp } = await makeResp(
      'https://di0v2frwtdqnv.cloudfront.net/api/v1/property/paper_signs/blog/1/f0fd7e9fb40c3e84770bd2bbc8b510780eb3e2d1.json',
      data,
    )
    const results: URL[] = []
    await parser.parse(resp, req, (result) => results.push(result))

    // order doesn't matter in these results
    const sorted = results.map(r => r.toString()).sort()
    expect(sorted).to.deep.eq([
      'https://di0v2frwtdqnv.cloudfront.net/api/v1/blog/mentoring-during-covid/2fe48e32b5a5e179b2222281bdb24d2315a65d34.json',
      'https://di0v2frwtdqnv.cloudfront.net/api/v1/property/paper_signs/blog/1/f0fd7e9fb40c3e84770bd2bbc8b510780eb3e2d1.json',
      'https://di0v2frwtdqnv.cloudfront.net/api/v1/property/paper_signs/blog/18/66463ba9bb407cc00c3b1c922deca6d8537f3d10.json',
      'https://di0v2frwtdqnv.cloudfront.net/api/v1/property/paper_signs/blog/2/66fa1b1bd647052f05a5986b1737d21393d4aabd.json',
      'https://di0v2frwtdqnv.cloudfront.net/blog/mentoring-during-covid/2fe48e32b5a5e179b2222281bdb24d2315a65d34.fragment',
      'https://images.ctfassets.net/lwoaet07hh7w/28laOpGCovafkvHl6VHuh0/be4565eec1fadd06374c1c2e7611704c/_DSC0986.jpg'
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
