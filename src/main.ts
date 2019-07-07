import yargs from 'yargs'

import Linkscanner from '.'
import { debugLogger, defaultLogger } from './logger'

const argv = yargs
  .command('$0', 'Scans a web page for broken links')
  .example('$0 http://google.com', 'parses a[href] elements from google.com and checks all linked URLs')
  .option('followRedirects', {
    alias: 'L',
    description: 'Follow 301 & 302 redirects to their destination and report that result',
    boolean: true,
  })
  .option('debug', {
    boolean: true,
    description: 'Print additional debug logging to stderr',
    alias: 'd',
  })
  .option('verbose', {
    boolean: true,
    description: 'Print more information in the output results (formatter dependent)',
    alias: 'v',
  })
  .option('--no-progress', {
    boolean: true,
    description: 'Do not display a progress bar',
    alias: 'P',
  })
  .option('recursive', {
    boolean: true,
    description: 'Recursively crawl all links on the same host',
    alias: 'r',
  })
  .option('exclude-external', {
    boolean: true,
    description: 'Do not test links that point to other hosts',
    alias: 'e',
  })
  .option('formatter', {
    alias: 'f',
    description: 'Choose the output formatter',
    choices: ['table', 'console'] as const,
  })
  .option('include', {
    alias: 'i',
    array: true,
    type: 'string',
    description: 'CSS Selector for which HTML elements that should be scanned',
    choices: ['a', 'link', 'img', 'script', 'form', 'iframe', 'all'],
  }).argv

const defaults = {
}

const instance = new Linkscanner({
  ...defaults,
  ...argv,
})

instance.run(argv._)
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
