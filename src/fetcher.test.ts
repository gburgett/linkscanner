import { expect } from 'chai'
import { Response } from 'cross-fetch'
import fetchMock from 'fetch-mock'
import {} from 'mocha'

import { collect } from 'async-toolbox/stream'
import { Fetcher, Parser } from './fetcher'
import { Result } from './model'
import { parseUrl } from './url'

describe('Fetch', () => {
  const instance = (parser: Parser) =>
    new Fetcher({
      hostnames: new Set(['test.com']),
      parsers: {
        default: parser,
      },
    })

  it('gets a result from a page', async () => {
    const uut = instance(success)

    // act
    await uut.writeAsync(parseUrl('https://jsonplaceholder.typicode.com'))
    await uut.endAsync()
    const result: Result[] = await collect(uut)

    expect(result[0].status).to.eq(200)
    expect(result[0].host).to.eq('jsonplaceholder.typicode.com')
    expect(result[0].url.toString()).to.eq('https://jsonplaceholder.typicode.com/')
  })

  it('performs a HEAD request when the host does not match', async () => {
    const uut = instance(success)

    fetchMock.headOnce('http://other.com', 200)

    // act
    await uut.writeAsync(parseUrl('http://other.com'))
    await uut.endAsync()
    const result: Result[] = await collect(uut)

    expect(result[0].status).to.eq(200)
    expect(result[0].host).to.eq('other.com')
    expect(result[0].url.toString()).to.eq('http://other.com/')

    const call = fetchMock.lastCall(/other\.com/)!
    expect(call[1]!.method).to.eq('HEAD')
  })
})

const success: Parser = {
  parse: async (resp: Response, req: Request) => {
    const rawUrl = resp.url && resp.url.length > 0 ? resp.url : req.url
    const url = parseUrl(rawUrl)
    return {
      url,
      host: url.hostname,
      ms: 1,
      status: resp.status,
    }
  },
}

Object.defineProperty(Response, 'url', {
  get() {
    if (this._url) {
      return this._url
    }
    return super.get()
  },
  set(value) {
    this._url = value
  },
})
