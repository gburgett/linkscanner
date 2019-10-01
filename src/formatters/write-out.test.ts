import { expect } from 'chai'
import {} from 'mocha'

import { } from 'async-toolbox/stream'
import { Logger } from '../logger'
import { ErrorResult, Result, SuccessResult } from '../model'
import { parseUrl } from '../url'
import { WriteOutFormatter } from './write-out'

// tslint:disable: max-line-length

describe('WriteOut formatter', () => {
  it('prints formatted %{response_code}', async () => {
    const messages: string[] = []
    const logger = { log: (msg: string) => messages.push(msg) }

    const instance = new WriteOutFormatter({
      logger: logger as unknown as Logger,
      formatter: 'test %{response_code}\t%{time_total}',
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
    }

    // act
    instance.write(result)
    await instance.endAsync()

    // assert
    expect(messages[0]).to.eq('test 200\t123')
    expect(messages.length).to.eq(1)
  })

  it('merges several redirects', async () => {
    const messages: string[] = []
    const logger = { log: (msg: string) => messages.push(msg) }

    const instance = new WriteOutFormatter({
      logger: logger as unknown as Logger,
      formatter: '%{response_code} %{url} ==> %{url_effective} (%{num_redirects} %{time_total}ms)',
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
    }

    // tslint:disable: max-line-length
    const redirects: SuccessResult[] = [
      { type: 'success', status: 301, ms: 1, url: parseUrl('http://test.com/r1'), parent: top, method: 'GET', contentType: '', host: 'test.com', links: [] },
    ]
    redirects.push({ type: 'success', status: 302, ms: 1, url: parseUrl('http://test.com/r2'), parent: redirects[0], method: 'GET', contentType: '', host: 'test.com', links: []})
    redirects.push({ type: 'success', status: 307, ms: 1, url: parseUrl('http://test.com/r3'), parent: redirects[1], method: 'GET', contentType: '', host: 'test.com', links: []})
    // tslint:disable: max-line-length

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
    }

    // act
    instance.write(top)
    redirects.forEach((r) => instance.write(r))
    instance.write(final)
    await instance.endAsync()

    // assert
    // tslint:disable-next-line: max-line-length
    expect(messages[0]).to.deep.eq(`200 http://test.com/# ==> http://test.com/# (0 123ms)`)
    expect(messages[1]).to.deep.eq(`204 http://test.com/r1 ==> http://test.com/final (3 126ms)`)
    expect(messages.length).to.eq(2)
  })
})
