import { expect } from 'chai'
import {} from 'mocha'

import { } from 'async-toolbox/stream'
import { Logger } from '../logger'
import { ErrorResult, Result, SkippedResult, SuccessResult } from '../model'
import { parseUrl } from '../url'
import { WriteOutFormatter } from './write-out'

// tslint:disable: max-line-length

describe('WriteOut formatter', () => {
  it('prints formatted %{response_code}', async () => {
    const messages: string[] = []
    const logger = { log: (msg: string) => messages.push(msg) }

    const instance = new WriteOutFormatter({
      logger: logger as unknown as Logger,
      formatter: 'test %{response_code}\t%{time_total}\t%{content_type}',
    })
    const result: SuccessResult = {
      type: 'success',
      status: 200,
      method: 'GET',
      url: parseUrl('http://test.com/#'),
      contentType: 'text/html',
      host: 'test.com',
      ms: 123,
      links: [],
      headers: {},
    }

    // act
    instance.write(result)
    await instance.endAsync()

    // assert
    expect(messages[0]).to.eq('test 200\t123\ttext/html')
    expect(messages.length).to.eq(1)
  })

  it('merges several redirects', async () => {
    const messages: string[] = []
    const logger = { log: (msg: string) => messages.push(msg) }

    const instance = new WriteOutFormatter({
      logger: logger as unknown as Logger,
      formatter: '%{response_code} %{url} ==> %{response_code_effective} %{url_effective} (%{num_redirects} %{time_total}ms)',
    })
    const top: SuccessResult = {
      type: 'success',
      status: 200,
      method: 'GET',
      url: parseUrl('http://test.com/#'),
      contentType: 'text/html',
      host: 'test.com',
      ms: 123,
      links: [parseUrl('http://test.com/r1')],
      headers: {},
    }

    const redirects: SuccessResult[] = [
      { type: 'success', status: 301, ms: 1, url: parseUrl('http://test.com/r1'), parent: top, method: 'GET', contentType: '', host: 'test.com', links: [], headers: {} },
    ]
    redirects.push({ type: 'success', status: 302, ms: 1, url: parseUrl('http://test.com/r2'), parent: redirects[0], method: 'GET', contentType: '', host: 'test.com', links: [], headers: {}})
    redirects.push({ type: 'success', status: 307, ms: 1, url: parseUrl('http://test.com/r3'), parent: redirects[1], method: 'GET', contentType: '', host: 'test.com', links: [], headers: {}})

    const final: SuccessResult = {
      type: 'success',
      status: 204,
      method: 'GET',
      url: parseUrl('http://test.com/final'),
      parent: redirects[2],
      contentType: 'text/html',
      host: 'test.com',
      ms: 123,
      leaf: true,
      links: [],
      headers: {},
    }

    // act
    instance.write(top)
    redirects.forEach((r) => instance.write(r))
    instance.write(final)
    await instance.endAsync()

    // assert
    // tslint:disable-next-line: max-line-length
    expect(messages[0]).to.deep.eq(`200 http://test.com/# ==> 200 http://test.com/# (0 123ms)`)
    expect(messages[1]).to.deep.eq(`301 http://test.com/r1 ==> 204 http://test.com/final (3 126ms)`)
    expect(messages.length).to.eq(2)
  })

  it('ignores skip results', async () => {
    const messages: string[] = []
    const logger = { log: (msg: string) => messages.push(msg) }

    const instance = new WriteOutFormatter({
      logger: logger as unknown as Logger,
      formatter: 'test %{response_code}\t%{time_total}\t%{content_type}',
    })
    const result: SkippedResult = {
      type: 'skip',
      url: parseUrl('http://test.com/#'),
      host: 'test.com',
      leaf: true,
      reason: 'external',
    }

    // act
    instance.write(result)
    await instance.endAsync()

    // assert
    expect(messages.length).to.eq(0)
  })

  it('writes error results', async () => {
    const messages: string[] = []
    const logger = { log: (msg: string) => messages.push(msg) }

    const instance = new WriteOutFormatter({
      logger: logger as unknown as Logger,
      formatter: '%{response_code}\t%{error_reason}\t%{error_message}',
    })
    const result: ErrorResult = {
      type: 'error',
      method: 'GET',
      url: parseUrl('http://test.com/#'),
      host: 'test.com',
      leaf: true,
      error: new Error('Test Error!'),
      status: undefined,
      reason: 'error',
    }

    // act
    instance.write(result)
    await instance.endAsync()

    // assert
    expect(messages[0]).to.eq('\terror\tTest Error!')
    expect(messages.length).to.eq(1)
  })

  it('does not orphan redirects where we already hit the destination', async () => {
    const messages: string[] = []
    const logger = { log: (msg: string) => messages.push(msg) }

    const instance = new WriteOutFormatter({
      logger: logger as unknown as Logger,
      formatter: '%{response_code} %{url} ==> %{response_code_effective} %{url_effective} (%{num_redirects} %{time_total}ms)',
    })
    const page: SuccessResult = {
      type: 'success',
      status: 200,
      method: 'GET',
      url: parseUrl('http://test.com/some-page'),
      contentType: 'text/html',
      host: 'test.com',
      ms: 123,
      links: [],
      headers: {},
    }

    // tslint:disable: max-line-length
    const redirects: SuccessResult[] = [
      { type: 'success', status: 301, ms: 1, url: parseUrl('http://test.com/r1'), parent: undefined, method: 'GET', contentType: '', host: 'test.com', links: [],
        headers: {Location: 'http://test.com/some-page'} },
    ]

    // act
    instance.write(page)
    redirects.forEach((r) => instance.write(r))
    await instance.endAsync()

    expect(messages[0]).to.deep.eq(`200 http://test.com/some-page ==> 200 http://test.com/some-page (0 123ms)`)
    expect(messages[1]).to.deep.eq(`301 http://test.com/r1 ==> 200 http://test.com/some-page (1 124ms)`)
    expect(messages.length).to.eq(2)
  })
})
