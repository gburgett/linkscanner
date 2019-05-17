import yargs from 'yargs'

import Run from '.'
import { defaultLogger, verboseLogger } from './logger'

const argv = yargs
  .option('followRedirects', {
    boolean: true,
  })
  .option('verbose', {
    boolean: true,
    alias: 'v',
  }).argv

const defaults = {}

Run({
  ...defaults,
  logger: argv.verbose ? verboseLogger : defaultLogger,
  source: argv._,
  ...argv,
})
  .then(
    () => {
      process.exit(0)
    },
    (ex: any) => {
      // tslint:disable-next-line:no-console
      console.error(ex)
      process.exit(1)
    },
  )
