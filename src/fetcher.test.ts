import { expect } from 'chai'
import * as crossFetch from 'cross-fetch'
import fetchMock from 'fetch-mock'
import { } from 'mocha'

import { wait } from 'async-toolbox'
import { collect } from 'async-toolbox/stream'
import { Fetcher, FetchOptions } from './fetcher'
import { ErrorReason, ErrorResult, Result } from './model'
import { parseUrl } from './url'

// tslint:disable:no-unused-expression

describe('Fetcher', () => {
  let options: Partial<FetchOptions>
  let fetchMockSandbox: fetchMock.FetchMockSandbox
  beforeEach(() => {
      fetchMock.reset()
      fetchMockSandbox = fetchMock.sandbox()
      options = {
        fetch: {
          ...crossFetch,
          fetch: fetchMockSandbox,
          Request: fetchMock.config.Request!,
        },
      }
    })

  const instance = (additionalOptions?: Partial<FetchOptions>) =>
    new Fetcher({
      ...options,
      ...additionalOptions,
    })

  it('gets a result from a page', async () => {
    const uut = new Fetcher({
      // note: intentionally not setting a mock fetcher.  This is a true integration test.
    })

    // act
    await uut.writeAsync({ url: parseUrl('https://jsonplaceholder.typicode.com') })
    await uut.endAsync()
    const result: Result[] = await collect(uut)

    expect(result[0].status).to.eq(200)
    expect(result[0].host).to.eq('jsonplaceholder.typicode.com')
    expect(result[0].url.toString()).to.eq('https://jsonplaceholder.typicode.com/')
  })

  it('performs a HEAD request when the node is a leaf', async () => {
    const uut = instance()

    fetchMockSandbox.headOnce('http://other.com', 200)

    // act
    await uut.writeAsync({ url: parseUrl('http://other.com'), leaf: true })
    await uut.endAsync()
    const result: Result[] = await collect(uut)

    expect(result[0].status).to.eq(200)
    expect(result[0].host).to.eq('other.com')
    expect(result[0].url.toString()).to.eq('http://other.com/')

    const call = fetchMockSandbox.lastCall(/other\.com/)!
    expect(call[1]!.method).to.eq('HEAD')
  })

  it('retries as a GET when the HEAD response is 405', async () => {
    const uut = instance()

    fetchMockSandbox.headOnce('http://other.com', 405)
    fetchMockSandbox.getOnce('http://other.com', 200)

    // act
    await uut.writeAsync({ url: parseUrl('http://other.com'), leaf: true })
    await uut.endAsync()
    const result: Result[] = await collect(uut)

    expect(result[0].status).to.eq(200)
    expect(result[0].host).to.eq('other.com')
    expect(result[0].url.toString()).to.eq('http://other.com/')

    const calls = fetchMockSandbox.calls(/other\.com/)!
    expect(calls[0][1]!.method).to.eq('HEAD')
    expect(calls[1][1]!.method).to.eq('GET')
  })

  it('pushes an error result when fetch throws', async () => {
    const uut = instance()

    fetchMockSandbox.getOnce('http://other.com', () => { throw new Error(`test error!`) })

    // act
    await uut.writeAsync({ url: parseUrl('http://other.com') })
    await uut.endAsync()
    const result: Result[] = await collect(uut)

    const r0 = result[0] as ErrorResult
    expect(r0.status).to.be.undefined
    expect(r0.reason).to.eq('error')
    expect(r0.host).to.eq('other.com')
    expect(r0.url.toString()).to.eq('http://other.com/')
  })

  it('pushes a timeout result', async () => {
    const uut = instance({
      timeout: 10,
    })

    fetchMockSandbox.getOnce('http://other.com', async () => {
      await wait(100)
      return 200
    })

    // act
    await uut.writeAsync({ url: parseUrl('http://other.com') })
    await uut.endAsync()
    const result: Result[] = await collect(uut)

    const r0 = result[0] as ErrorResult
    expect(r0.status).to.be.undefined
    expect(r0.reason).to.eq('timeout')
    expect(r0.host).to.eq('other.com')
    expect(r0.url.toString()).to.eq('http://other.com/')
  })
})
