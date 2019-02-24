import { collect } from 'async-toolbox/stream'
import { Fetch } from './fetch'
import { Result } from './model'
import { Parse } from './parse'
import { Reentry } from './reentry'
import { loadSource } from './source'
import { parseUrl } from './url'

export interface Args {
  source: string | string[],
  hostnames?: string | string[]
}

async function Run(args: Args): Promise<void> {
  const hostnames = args.hostnames ?
    new Set([...args.hostnames]) :
    new Set([...args.source].map((s) => parseUrl(s).hostname))

  const source = loadSource(args)

  const reentry = new Reentry({ hostnames })

  const results = source.pipe(reentry, { end: false })
    .pipe(new Fetch({ hostnames: reentry.hostnames }))
    .pipe(new Parse({ hostnames: reentry.hostnames }))

  await collect(results, (result: Result) => {
    console.log(result)
  })
}

export default Run
