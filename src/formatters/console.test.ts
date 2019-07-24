import {} from 'async-toolbox/events'
import { collect } from 'async-toolbox/stream'
import { expect } from 'chai'
import {} from 'mocha'

import { Logger } from '../logger'
import { Result, SkippedResult, SuccessResult } from '../model'
import { parseUrl } from '../url'
import { ConsoleFormatter } from './console'

describe('ConsoleFormatter', () => {
  it('logs the result to the console', async () => {
    const messages: string[] = []
    const instance = new ConsoleFormatter({
      logger: {
        ...console,
        log: (msg: string) => messages.push(msg),
      } as any,
    })

    const successResult: SuccessResult = {
      method: 'GET',
      url: parseUrl('http://www.test.com'),
      host: 'www.test.com',
      status: 200,
      ms: 123,
      links: [parseUrl('http://www.test.com/asdf')],
    } as SuccessResult
    instance.write(successResult)

    const skippedResult: SkippedResult = {
      url: parseUrl('http://www.test.com/asdf'),
      type: 'skip',
      reason: 'disallowed',
      leaf: true,
      host: 'www.test.com',
      parent: successResult,
    }
    instance.write(skippedResult)
    instance.end()

    await instance.onceAsync('finish')

    expect(messages.length).to.eq(1)
    expect(messages[0]).to.include('200')
    expect(messages[0]).to.include('GET')
    expect(messages[0]).to.include('http://www.test.com')
    expect(messages[0]).to.include('1 links found')
    expect(messages[0]).to.include('1 not checked')
    expect(messages[0]).to.include('0 broken')
  })

  it('does not log leaf nodes', async () => {
    const messages: string[] = []
    const instance = new ConsoleFormatter({
      logger: {
        ...console,
        log: (msg: string) => messages.push(msg),
      } as any,
    })

    const parent: Result = {
      type: 'success',
      method: 'GET',
      url: parseUrl('http://www.test.com'),
      host: 'www.test.com',
      status: 200,
      ms: 123,
      links: [parseUrl('http://www.test2.com')],
    }

    instance.write(parent)

    instance.write({
      type: 'success',
      leaf: true,
      parent,
      method: 'HEAD',
      url: parseUrl('http://www.test2.com'),
      host: 'www.test.com',
      status: 500,
      ms: 123,
      links: [],
    } as Result)
    instance.end()

    await instance.onceAsync('finish')

    expect(messages.length).to.eq(1)
    expect(messages[0]).to.include('200')
    expect(messages[0]).to.include('GET')
    expect(messages[0]).to.include('http://www.test.com')
    expect(messages[0]).to.include('1 links found')
    expect(messages[0]).to.include('1 broken')
  })

  it('logs recursive nodes', async () => {
    const messages: string[] = []
    const instance = new ConsoleFormatter({
      logger: {
        ...console,
        log: (msg: string) => messages.push(msg),
      } as any,
    })

    const parent: Result = {
      type: 'success',
      method: 'GET',
      url: parseUrl('http://www.test.com'),
      host: 'www.test.com',
      status: 200,
      ms: 123,
      links: [parseUrl('http://www.test2.com')],
    }
    const child1: Result = {
      parent,
      type: 'success',
      method: 'GET',
      url: parseUrl('http://www.test2.com'),
      host: 'www.test2.com',
      status: 201,
      ms: 123,
      links: [parseUrl('http://www.test3.com')],
    }
    const child2: Result = {
      type: 'success',
      leaf: true,
      parent: child1,
      method: 'HEAD',
      url: parseUrl('http://www.test3.com'),
      host: 'www.test3.com',
      status: 500,
      ms: 123,
      links: [],
    }

    instance.write(parent)
    instance.write(child1)
    instance.write(child2)
    instance.end()

    await instance.onceAsync('finish')

    expect(messages.length).to.eq(2)
    expect(messages[1]).to.include('201')
    expect(messages[1]).to.include('GET')
    expect(messages[1]).to.include('http://www.test2.com')
    expect(messages[1]).to.include('1 links found')
    expect(messages[1]).to.include('1 broken')
  })
})
