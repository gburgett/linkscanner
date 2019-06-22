# Linkscanner

[![npm version](https://badge.fury.io/js/linkscanner.svg)](https://badge.fury.io/js/linkscanner) [![Build Status](https://travis-ci.org/gburgett/linkscanner.svg?branch=master)](https://travis-ci.org/gburgett/linkscanner)

Linkscanner will recursively scan your site for broken links, including css and
javascript files if you ask it to.

usage:
```
linkscanner

Scans a web page for broken links

Options:
  --help                  Show help                                    [boolean]
  --version               Show version number                          [boolean]
  --followRedirects, -L   Follow 301 & 302 redirects to their destination and
                          report that result                           [boolean]
  --debug, -d             Print additional debug logging to stderr     [boolean]
  --verbose, -v           Print more information in the output results
                          (formatter dependent)                        [boolean]
  --recursive, -r         Recursively crawl all links on the same host [boolean]
  --exclude-external, -e  Do not test links that point to other hosts  [boolean]
  --formatter, -f         Choose the output formatter
                                                   [choices: "table", "console"]
  --include, -i           CSS Selector for which HTML elements that should be
                          scanned
        [array] [choices: "a", "link", "img", "script", "form", "iframe", "all"]
```

example:

```
▶ linkscanner -r http://gordonburgett.net
200 GET  http://gordonburgett.net/
	26 links found. 0 not checked. 0 broken.
	301 GET  http://gordonburgett.net/albania
	301 GET  http://gordonburgett.net/search
	301 HEAD http://www.gordonburgett.net/index.xml
	301 HEAD http://www.gordonburgett.net/

200 GET  http://gordonburgett.net/sq/
	found on http://gordonburgett.net/
	14 links found. 0 not checked. 0 broken.
	301 GET  http://gordonburgett.net/sq/albania
	301 GET  http://gordonburgett.net/sq/search
	301 HEAD http://www.gordonburgett.net/index.xml
	301 HEAD http://www.gordonburgett.net/sq/

200 GET  http://gordonburgett.net/post/2019/04_summer_projects_2019/
	found on http://gordonburgett.net/
	13 links found. 0 not checked. 0 broken.
	301 GET  http://gordonburgett.net/albania
	301 GET  http://gordonburgett.net/search
	301 HEAD http://www.gordonburgett.net/index.xml
	301 HEAD http://biblehub.com/esv/1_corinthians/3.htm
	301 HEAD https://www.teamalbania.org/blog/2019-02-25-the-plus-in-albania-plus
	301 HEAD http://biblehub.com/esv/1_corinthians/3.htm
	301 HEAD http://www.gordonburgett.net/post/2019/04_summer_projects_2019/

...
```

When STDOUT is not a TTY (for example, when piping) then the default output formatter
is the Table format.  This makes it easy to work with using command line tools:

```
▶ linkscanner  http://gordonburgett.net/ | awk '{ print $3,$1 }'
http://gordonburgett.net/ 200
http://gordonburgett.net/albania 301
http://gordonburgett.net/search 301
http://gordonburgett.net/sq/ 200
http://www.gordonburgett.net/index.xml 301
http://gordonburgett.net/# 200
http://gordonburgett.net/pubkey.txt 200
http://gordonburgett.net/post/2019/04_summer_projects_2019/ 200
http://gordonburgett.net/post/2018/07_acts_29_in_albania/ 200
http://gordonburgett.net/post/2018/05_enrolled_at_hogwarts/ 200
http://gordonburgett.net/post/2018/04_upcoming_summer_project/ 200
http://gordonburgett.net/post/2017/12_mens_retreat/ 200
http://gordonburgett.net/post/2017/10_nothings_over/ 200
http://gordonburgett.net/post/2017/07_making_a_searchable_static_site/ 200
http://gordonburgett.net/post/2017/07_home/ 200
http://gordonburgett.net/post/ 200
http://www.gordonburgett.net/ 301
https://github.com/gburgett 200
```

The verbose table format is a markdown table:

```
▶ linkscanner -v http://gordonburgett.net/ | pbcopy
```

| status | method | url                                                                              |   ms | parent                                                                           |
| ------ | ------ | -------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------- |
| 200    | GET    | http://gordonburgett.net/                                                        |   86 |                                                                                  |
| 301    | HEAD   | http://gordonburgett.net/albania                                                 |   67 | http://gordonburgett.net/                                                        |
| 301    | HEAD   | http://gordonburgett.net/search                                                  |   52 | http://gordonburgett.net/                                                        |
| 200    | HEAD   | http://gordonburgett.net/sq/                                                     |   55 | http://gordonburgett.net/                                                        |
| 301    | HEAD   | http://www.gordonburgett.net/index.xml                                           |   55 | http://gordonburgett.net/                                                        |
| 200    | HEAD   | http://gordonburgett.net/#                                                       |   51 | http://gordonburgett.net/                                                        |
| 200    | HEAD   | http://gordonburgett.net/pubkey.txt                                              |   50 | http://gordonburgett.net/                                                        |
| 200    | HEAD   | http://gordonburgett.net/post/2019/04_summer_projects_2019/                      |   77 | http://gordonburgett.net/                                                        |
| 200    | HEAD   | http://gordonburgett.net/post/2018/07_acts_29_in_albania/                        |   49 | http://gordonburgett.net/                                                        |
| 200    | HEAD   | http://gordonburgett.net/post/2018/05_enrolled_at_hogwarts/                      |   40 | http://gordonburgett.net/                                                        |
| 200    | HEAD   | http://gordonburgett.net/post/2018/04_upcoming_summer_project/                   |   45 | http://gordonburgett.net/                                                        |
| 200    | HEAD   | http://gordonburgett.net/post/2017/12_mens_retreat/                              |   67 | http://gordonburgett.net/                                                        |
| 200    | HEAD   | http://gordonburgett.net/post/2017/10_nothings_over/                             |   59 | http://gordonburgett.net/                                                        |
| 200    | HEAD   | http://gordonburgett.net/post/2017/07_making_a_searchable_static_site/           |   51 | http://gordonburgett.net/                                                        |
| 200    | HEAD   | http://gordonburgett.net/post/2017/07_home/                                      |   47 | http://gordonburgett.net/                                                        |
| 200    | HEAD   | http://gordonburgett.net/post/                                                   |   44 | http://gordonburgett.net/                                                        |
| 301    | HEAD   | http://www.gordonburgett.net/                                                    |   54 | http://gordonburgett.net/                                                        |
| 200    | HEAD   | https://github.com/gburgett                                                      | 1375 | http://gordonburgett.net/                                                        |



To get back to the regular format you can use `-f console`:

```
▶ linkscanner  http://gordonburgett.net/ -f console | pbcopy
```
```
200 GET  http://gordonburgett.net/
	26 links found. 0 not checked. 0 broken.
	301 HEAD http://gordonburgett.net/albania
	301 HEAD http://gordonburgett.net/search
	301 HEAD http://www.gordonburgett.net/index.xml
	301 HEAD http://www.gordonburgett.net/
```

Check JS, CSS, and Images with the `--include=all` option:

```
▶ linkscanner -i all -f table http://gordonburgett.net
...
200	HEAD	http://maxcdn.bootstrapcdn.com/font-awesome/4.3.0/css/font-awesome.min.css      	  63	http://gordonburgett.net/
200	HEAD	http://gordonburgett.net/css/uno.min.css                                        	 108	http://gordonburgett.net/
200	HEAD	https://github.com/gburgett                                                     	 847	http://gordonburgett.net/
200	HEAD	http://gordonburgett.net/css/custom.css                                         	 121	http://gordonburgett.net/
200	HEAD	https://code.jquery.com/jquery-2.2.4.min.js                                     	  92	http://gordonburgett.net/
200	HEAD	http://gordonburgett.net/js/highlight/styles/vs2015.css                         	 181	http://gordonburgett.net/
200	HEAD	http://gordonburgett.net/js/main.min.js                                         	  92	http://gordonburgett.net/
200	HEAD	http://gordonburgett.net/js/custom.js                                           	  88	http://gordonburgett.net/
200	HEAD	http://gordonburgett.net/js/highlight/highlight.pack.js                         	  87	http://gordonburgett.net/
```
