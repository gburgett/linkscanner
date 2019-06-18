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
  })
  .option('recursive', {
    boolean: true,
    alias: 'r',
  })
  .option('exclude-external', {
    boolean: true,
    alias: 'e',
  })
  .option('formatter', {
    alias: 'f',
    choices: ['table'] as const,
  }).argv

const defaults = {
  logger: argv.verbose ? verboseLogger : defaultLogger,
}

Run({
  ...defaults,
  source: argv._,
  ...argv,
})
  .then(
    () => {
      defaults.logger.debug('done')
      process.exit(0)
    },
    (ex: any) => {
      // tslint:disable-next-line:no-console
      console.error(ex)
      process.exit(1)
    },
  )
