import {wait} from 'async-toolbox'
import {} from 'async-toolbox/events'
import { collect } from 'async-toolbox/stream'
import { expect } from 'chai'
import { } from 'mocha'

import { EOF, isEOF, Reentry } from './reentry'
import { parseUrl } from './url'

// tslint:disable: no-unused-expression

describe('Reentry', () => {

  it('pushes a raw string as a chunk', async () => {
    const instance = new Reentry()

    instance.write('http://www.test.com')
    instance.end()

    const chunks = await collect(instance)
    expect(chunks).to.deep.eq([
      { url: parseUrl('http://www.test.com') },
    ])
  })

  it('pushes a URL as a chunk', async () => {
    const instance = new Reentry()

    instance.write(parseUrl('http://www.test.com'))
    instance.end()

    const chunks = await collect(instance)
    expect(chunks).to.deep.eq([
      { url: parseUrl('http://www.test.com') },
    ])
  })

  it('doesnt push the same URL twice', async () => {
    const instance = new Reentry()

    instance.write('http://www.test.com')
    instance.write(parseUrl('http://www.test.com'))
    instance.end()

    const chunks = await collect(instance)
    expect(chunks).to.deep.eq([
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
    expect(chunks).to.deep.eq([
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
      expect(chunks.length).to.eq(1)
      expect(isEOF(chunks[0])).to.be.true
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

      await instance.onceAsync('end')
      expect(collected.length).to.eq(2)
      expect(collected[1]).to.eq(lastEOF)
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

      await instance.onceAsync('end')
      expect(collected.length).to.eq(4)
      expect(collected[1]).to.eq(firstEOF)
      expect(collected[2]).to.deep.eq({ url: parseUrl('http://www.test2.com')})
      expect(isEOF(collected[3])).to.be.true
    })
  })
})
