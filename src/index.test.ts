import { expect } from 'chai'
import {} from 'mocha'

import { sum } from './index'

describe('sum', () => {
  it('1 + 1 = 2', () => {
    expect(sum(1, 1)).to.eq(2)
  })
})
