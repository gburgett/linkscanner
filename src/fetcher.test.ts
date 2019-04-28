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
    await uut.writeAsync(parseUrl('https://google.com'))
    await uut.endAsync()
    const result: Result[] = await collect(uut)

    expect(result[0].status).to.eq(200)
    expect(result[0].host).to.eq('www.google.com')
    expect(result[0].url.toString()).to.eq('https://www.google.com/')
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
  parse: async (resp: Response) => {
    const url = parseUrl(resp.url)
    return {
      url,
      host: url.hostname,
      ms: 1,
      status: resp.status,
    }
  },
}
