import { wait } from 'async-toolbox'
import { collect } from 'async-toolbox/stream'
import { expect } from 'chai'
import fetchMock from 'fetch-mock'
import { } from 'mocha'

import { FetchInterfaceWrapper } from './fetch_interface'
import { Fetcher, FetchOptions } from './fetcher'
import { ErrorResult, Result, SuccessResult } from './model'
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
          fetch: fetchMockSandbox,
          Request: fetchMock.config.Request!,
        },
      }
    })

  const instance = (additionalOptions?: Partial<FetchOptions>) =>
    new Fetcher({
      ...options,
      ...additionalOptions,
      logger: console,
    })

  it.skip('gets a result from a page', async function() {
    this.timeout(10000)
    const uut = new Fetcher({
      // note: intentionally not setting a mock fetcher.  This is a true integration test.
    })

    // act
    await uut.writeAsync({ url: parseUrl('https://github.com/gburgett/linkscanner') })
    await uut.endAsync()
    const result: Result[] = await collect(uut)

    expect((result[0] as ErrorResult).error).to.be.undefined
    expect(result[0].type).to.eq('success')
    expect((result[0] as SuccessResult).status).to.eq(200)
    expect(result[0].host).to.eq('github.com')
    expect(result[0].url.toString()).to.eq('https://github.com/gburgett/linkscanner')
  })

  it('performs a HEAD request when the node is a leaf', async () => {
    const uut = instance()

    fetchMockSandbox.headOnce('http://other.com', 200)

    // act
    await uut.writeAsync({ url: parseUrl('http://other.com'), leaf: true })
    await uut.endAsync()
    const result: Result[] = await collect(uut)

    expect((result[0] as SuccessResult).status).to.eq(200)
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

    expect(result[0].type).to.eq('success')
    expect((result[0] as SuccessResult).status).to.eq(200)
    expect(result[0].host).to.eq('other.com')
    expect(result[0].url.toString()).to.eq('http://other.com/')

    const calls = fetchMockSandbox.calls(/other\.com/)!
    expect(calls[0][1]!.method).to.eq('HEAD')
    expect(calls[1][1]!.method).to.eq('GET')
  })

  it('does not parse body when a leaf 405 is retried as a GET', async () => {
    const uut = instance()

    fetchMockSandbox.headOnce('http://other.com', 405)
    fetchMockSandbox.getOnce('http://other.com', {
      status: 200,
      headers: {
        'content-type': 'text/html',
      },
      body: '<a href="http://www.google.com"></a>',
    })

    const emitted: URL[] = []
    uut.on('url', (url) => emitted.push(url))

    // act
    await uut.writeAsync({ url: parseUrl('http://other.com'), leaf: true })
    await uut.endAsync()
    await collect(uut)

    expect(emitted.length).to.eq(0)
  })

  it('follows redirects', async () => {
    const uut = instance({
      followRedirects: true,
    })

    fetchMockSandbox.headOnce('http://other.com', {
      status:  307,
      headers: {
        Location: 'http://www.other.com',
      },
    })

    fetchMockSandbox.headOnce('http://www.other.com/', 200)

    // act
    await uut.writeAsync({ url: parseUrl('http://other.com'), leaf: true })
    await uut.endAsync()
    const result: Result[] = await collect(uut)

    expect((result[0] as ErrorResult).error).to.be.undefined
    expect((result[0] as SuccessResult).status).to.eq(307)
    expect(result[0].host).to.eq('other.com')
    expect(result[0].url.toString()).to.eq('http://other.com/')
    expect(result[0].leaf).to.be.false

    expect((result[1] as SuccessResult).status).to.eq(200)
    expect(result[1].host).to.eq('www.other.com')
    expect(result[1].url.toString()).to.eq('http://www.other.com/')
    expect(result[1].parent).to.eq(result[0])
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
      fetch: new FetchInterfaceWrapper(options.fetch!, {
        timeout: 10,
      }),
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

  it('does not attempt to scan a media item', async () => {
    const uut = instance()

    const resp = new Response('', {
      status: 200,
      statusText: 'ok',
      headers: {
        'content-type': 'video/avi',
      },
    })
    Object.assign(resp, {
      json: () => { throw new Error(`attempted to read json!`) },
      text: () => { throw new Error(`attempted to read text!`) },
      blob: () => { throw new Error(`attempted to read blob!`) },
    })
    fetchMockSandbox.getOnce('http://other.com/some-video', resp)

    // act
    await uut.writeAsync({ url: parseUrl('http://other.com/some-video') })
    await uut.endAsync()
    const result: Result[] = await collect(uut)

    expect(result[0].type).to.eq('success')
    expect((result[0] as SuccessResult).status).to.eq(200)
    expect(result[0].host).to.eq('other.com')
    expect(result[0].url.toString()).to.eq('http://other.com/some-video')
  })
})
