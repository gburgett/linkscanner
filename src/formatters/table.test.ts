import { expect } from 'chai'
import {} from 'mocha'

import { } from 'async-toolbox/stream'
import { Logger } from '../logger'
import { ErrorResult, Result, SuccessResult } from '../model'
import { parseUrl } from '../url'
import { TableFormatter } from './table'

describe('TableFormatter', () => {
  it('logs the result to the console', async () => {
    const messages: string[] = []
    const logger = { log: (msg: string) => messages.push(msg) }

    const instance = new TableFormatter({
      logger: logger as unknown as Logger,
    })

    // act
    instance.write({
      status: 200,
      method: 'GET',
      url: parseUrl('http://test.com/#'),
      contentType: 'text/html',
      host: 'test.com',
      ms: 123,
    } as Result)
    await instance.endAsync()

    // assert
    expect(messages.length).to.eq(1)
    expect(messages[0]).to.deep.eq(`200\tGET \t${'http://test.com/#'.padEnd(80)}\ttext/html       \t 123\t\t`)
  })

  it('logs verbose output to the console', async () => {
    const messages: string[] = []
    const logger = { log: (msg: string) => messages.push(msg) }

    const instance = new TableFormatter({
      logger: logger as unknown as Logger,
      verbose: true,
    })

    // act
    const r0: SuccessResult = {
      type: 'success',
      status: 200,
      method: 'GET',
      url: parseUrl('http://test.com/#'),
      contentType: 'text/html',
      host: 'test.com',
      ms: 123,
      links: [],
    }
    instance.write(r0)

    instance.write({
      type: 'error',
      error: new Error('test'),
      reason: 'error',
      status: undefined,
      method: 'GET',
      url: parseUrl('http://test.com/2'),
      parent: r0,
      host: 'test.com',
      ms: 456,
      leaf: true,
    } as ErrorResult)
    await instance.endAsync()

    // assert
    expect(messages.length).to.eq(4)
    // tslint:disable: max-line-length
    expect(messages[0]).to.eq('| status | method | url                                                                              | contentType      |   ms | parent                                                                           | error |')
    expect(messages[1]).to.eq('| ------ | ------ | -------------------------------------------------------------------------------- | ---------------- | ---- | -------------------------------------------------------------------------------- | ----- |')
    expect(messages[2]).to.eq('| 200    | GET    | http://test.com/#                                                                | text/html        |  123 |                                                                                  |       |')
    expect(messages[3]).to.eq('|        | GET    | http://test.com/2                                                                |                  |  456 | http://test.com/#                                                                | Error: test |')
  })
})
