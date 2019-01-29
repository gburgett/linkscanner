import test from 'ava'

import { collect, toReadable } from '.'
import { wait } from '..'
import '../events'
import { ParallelTransform } from './parallel_transform'

test('pipes from readable to writable', async (t) => {
  const source = toReadable(upTo(1000))

  const instance = new ParallelTransform({
    objectMode: true,
    maxParallelChunks: 10,
    async transformAsync(chunk, encoding) {
      await wait(Math.random() * 10)
      this.push('xformed' + chunk)
    },
  })

  const chunks = await collect(source.pipe(instance))

  t.deepEqual(chunks.length, 1000)
  // should be written out of order since we are awaiting a random number of seconds
  const expected = upTo(1000).map((n) => 'xformed' + n)
  t.notDeepEqual(chunks, expected)

  const hash: { [chunk: string]: number} = {}
  for (const chunk of chunks) {
    hash[chunk] = (hash[chunk]) ? (hash[chunk] + 1) : 1
  }
  for (const chunk of expected) {
    t.deepEqual(hash[chunk], 1, `Chunk not found! ${chunk}`)
  }
})

function upTo(n: number): string[] {
  const res: string[] = []
  for (let i = 0; i < n; i++) {
    res.push(i.toString())
  }
  return res
}
