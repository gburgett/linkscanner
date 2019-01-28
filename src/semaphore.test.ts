import test from 'ava'

import { Semaphore } from './semaphore'

test('runs a task', async (t) => {
  const semaphore = new Semaphore()

  const p1 = semaphore.lock(async () => {
    await wait(1)
    return 'hi there'
  })

  let p1done: string | null = null
  p1.then((val) => p1done = val)
  t.falsy(p1done)

  await p1

  t.true(p1done == 'hi there')
})

test('handles task error', async (t) => {
  const semaphore = new Semaphore()

  const p1 = semaphore.lock(async () => '1')
  const p2 = semaphore.lock(async () => {
    await wait(1)
    throw new Error('oh no!')
  })
  const p3 = semaphore.lock(async () => '3')

  await t.notThrowsAsync(p1)
  await t.throwsAsync(p2)
  await t.notThrowsAsync(p3)

})

function wait(ms = 1): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(), ms)
  })
}
