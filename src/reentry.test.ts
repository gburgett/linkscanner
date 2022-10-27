import {wait} from 'async-toolbox'
import {onceAsync} from 'async-toolbox/events'
import { collect, ParallelTransform, toReadable } from 'async-toolbox/stream'

import { Readable, Transform, Writable } from 'stream'
import { EOF, handleEOF, isEOF, Reentry } from './reentry'
import { parseUrl } from './url'

// tslint:disable: no-unused-expression

describe('Reentry', () => {

  it('pushes a raw string as a chunk', async () => {
    const instance = new Reentry()

    instance.write('http://www.test.com')
    instance.end()

    const chunks = await collect(instance)
    expect(chunks).toEqual([
      { url: parseUrl('http://www.test.com') },
    ])
  })

  it('pushes a URL as a chunk', async () => {
    const instance = new Reentry()

    instance.write(parseUrl('http://www.test.com'))
    instance.end()

    const chunks = await collect(instance)
    expect(chunks).toEqual([
      { url: parseUrl('http://www.test.com') },
    ])
  })

  it('doesnt push the same URL twice', async () => {
    const instance = new Reentry()

    instance.write('http://www.test.com')
    instance.write(parseUrl('http://www.test.com'))
    instance.end()

    const chunks = await collect(instance)
    expect(chunks).toEqual([
      { url: parseUrl('http://www.test.com') },
    ])
  })

  it('will re-push a URL if it was first scanned as a leaf', async () => {
    const instance = new Reentry()

    instance.write({ url: parseUrl('http://www.test.com'), leaf: true })
    instance.write('http://www.test.com')
    instance.write(parseUrl('http://www.test.com'))
    instance.end()

    const chunks = await collect(instance)
    expect(chunks).toEqual([
      { url: parseUrl('http://www.test.com'), leaf: true },
      { url: parseUrl('http://www.test.com') },
    ])
  })

  describe('tryEnd()', () => {
    it('pushes an EOF', async () => {
      const instance = new Reentry()

      instance.tryEnd()
      instance.end()

      const chunks = await collect(instance)
      expect(chunks.length).toEqual(1)
      expect(isEOF(chunks[0])).toBeTruthy()
    })

    it('ends if no new data written before receiving EOF', async () => {
      let lastEOF: EOF | null = null
      const collected: any[] = []

      const instance = new Reentry()
      instance.on('data', (chunk) => {
        // send the first EOF back into the reentry
        if (isEOF(chunk) && !lastEOF) {
          lastEOF = chunk
          instance.write(chunk)
        }
        collected.push(chunk)
      })

      instance.write('http://www.test.com')
      instance.tryEnd()

      await onceAsync(instance, 'end')
      expect(collected.length).toEqual(2)
      expect(collected[1]).toEqual(lastEOF)
    })

    it('does not end if new data written after EOF', async () => {
      let firstEOF: EOF | null = null
      const collected: any[] = []

      const instance = new Reentry()
      instance.on('data', async (chunk) => {
        collected.push(chunk)

        if (isEOF(chunk)) {
          if (!firstEOF) {
            firstEOF = chunk
            await wait(1)
            // after the first EOF, write a new URL before sending the EOF back
            instance.write('http://www.test2.com')
          }
          // send all EOFs back to the reentry
          instance.write(chunk)
        }
      })

      instance.write('http://www.test.com')
      instance.tryEnd()

      await onceAsync(instance, 'end')
      expect(collected.length).toEqual(4)
      expect(collected[1]).toEqual(firstEOF)
      expect(collected[2]).toEqual({ url: parseUrl('http://www.test2.com')})
      expect(isEOF(collected[3])).toBeTruthy()
    })

    it('ends even when piped', async () => {
      const lastEOF: EOF | null = null

      const source = toReadable(['http://www.test.com'])

      const instance = source.pipe(new Reentry({ logger: console }), { end: false })

      const result = instance.pipe(handleEOF(instance))

      source.on('end', () => {
        instance.tryEnd()
      })

      // have to set the stream into flowing mode!
      result.on('data', (data) => {return})

      const collected = await collect(result)
      expect(collected.length).toEqual(1)
      expect(collected[0].url.toString()).toEqual('http://www.test.com/')
    })
  })
})
