
import { Request, Response } from 'cross-fetch'

import { CheerioParser } from './cheerio-parser'

describe('CheerioParser', () => {
  it('finds a URL in the response body', async () => {
    const parser = new CheerioParser()

    const req = new Request('https://google.com')
    const resp = new Response('<a href="https://google.com"></a>')
    const results: URL[] = []
    await parser.parse(resp, req, (result) => results.push(result))

    expect(results.length).toEqual(1)
    expect(results[0].toString()).toEqual('https://google.com/')
  })

  it('finds all relative and non-relative URLs in google homepage', async () => {
    const parser = new CheerioParser()

    const req = new Request('https://google.com')
    const resp = new Response(rawGoogleHtml)
    const results: URL[] = []
    await parser.parse(resp, req, (result) => results.push(result))

    expect(results.length).toEqual(19)
    expect(results[0].toString()).toEqual('http://www.google.com/imghp?hl=en&tab=wi')
    expect(results[18].toString()).toEqual('https://google.com/intl/en/policies/terms/')
  })

  it('finds canonical link', async () => {
    const parser = new CheerioParser()

    const req = new Request('https://google.com')
    const resp = new Response(`
    <html>
      <head>
      <link rel="canonical" href="https://www.google.com/canonical">
      </head>
    </html>
    `)
    const results: URL[] = []
    await parser.parse(resp, req, (result) => results.push(result))

    expect(results.length).toEqual(1)
    expect(results[0].toString()).toEqual('https://www.google.com/canonical')
  })

  it('respects base element', async () => {
    const parser = new CheerioParser()

    const req = new Request('https://google.com')
    const resp = new Response(`
      <html>
        <head>
          <base href="https://other.com/test/asdf">
        </head>
        <body>
          <a href="/some/root/url"></a>
          <a href="some/relative/url"></a>
        </body>
      </html>
      `)
    const results: URL[] = []
    await parser.parse(resp, req, (result) => results.push(result))

    expect(results.length).toEqual(2)
    expect(results[0].toString()).toEqual('https://other.com/some/root/url')
    expect(results[1].toString()).toEqual('https://other.com/test/some/relative/url')
  })

  it('handles relative base element', async () => {
    const parser = new CheerioParser()

    const req = new Request('https://google.com')
    const resp = new Response(`
      <html>
        <head>
          <base href="/test/base">
        </head>
        <body>
          <a href="/some/root/url"></a>
          <a href="some/relative/url"></a>
        </body>
      </html>
      `)
    const results: URL[] = []
    await parser.parse(resp, req, (result) => results.push(result))

    expect(results.length).toEqual(2)
    expect(results[0].toString()).toEqual('https://google.com/some/root/url')
    expect(results[1].toString()).toEqual('https://google.com/test/some/relative/url')
  })

  it('handles protocol relative URLs', async () => {
    const parser = new CheerioParser()

    const req = new Request('https://google.com')
    const resp = new Response('<a href="//images.ctfassets.net/asdf.png"></a>')
    const results: URL[] = []
    await parser.parse(resp, req, (result) => results.push(result))

    expect(results.length).toEqual(1)
    expect(results[0].toString()).toEqual('https://images.ctfassets.net/asdf.png')
  })

  it('ignores css & images with default options', async () => {
    const parser = new CheerioParser()

    const req = new Request('https://google.com')
    const resp = new Response(`
      <html>
        <head>
          <link rel="stylesheet" media="all" href="/assets/application.css">
        </head>
        <body>
          <img src="//images.ctfassets.net/test.jpg?w=1440">
          <script src="/js/application.js"></script>
        </body>
      </html>
      `)
    const results: URL[] = []
    await parser.parse(resp, req, (result) => results.push(result))

    expect(results.length).toEqual(0)
  })

  it('includes css & images with "all" option', async () => {
    const parser = new CheerioParser({
      include: ['all'],
    })

    const req = new Request('https://google.com')
    const resp = new Response(`
      <html>
        <head>
          <link rel="stylesheet" media="all" href="/assets/application.css">
        </head>
        <body>
          <img src="//images.ctfassets.net/test.jpg?w=1440">
          <script src="/js/application.js"></script>
        </body>
      </html>
      `)
    const results: URL[] = []
    await parser.parse(resp, req, (result) => results.push(result))

    expect(results.length).toEqual(3)
    expect(results[0].toString()).toEqual('https://google.com/assets/application.css')
    expect(results[1].toString()).toEqual('https://images.ctfassets.net/test.jpg?w=1440')
    expect(results[2].toString()).toEqual('https://google.com/js/application.js')
  })

  it('includes all elements whenever selector given', async () => {
    const parser = new CheerioParser({
      include: ['a', 'link', 'img', 'script', 'form', 'iframe'],
    })

    const req = new Request('https://google.com')
    const resp = new Response(`
      <html>
        <head>
          <link rel="canonical" href="https://www.google.com/canonical">
          <link rel="stylesheet" media="all" href="/assets/application.css">
        </head>
        <body>
          <a href="/other">Clickable</a>
          <img src="//images.ctfassets.net/test.jpg?w=1440">
          <script src="/js/application.js"></script>
          <form action="/post-me"></form>
          <iframe src="http://some-iframe.test.com"></iframe>
        </body>
      </html>
      `)
    const results: URL[] = []
    await parser.parse(resp, req, (result) => results.push(result))

    expect(results.length).toEqual(7)
    expect(results[0].toString()).toEqual('https://google.com/other')
    expect(results[1].toString()).toEqual('https://www.google.com/canonical')
    expect(results[2].toString()).toEqual('https://google.com/assets/application.css')
    expect(results[3].toString()).toEqual('https://images.ctfassets.net/test.jpg?w=1440')
    expect(results[4].toString()).toEqual('https://google.com/js/application.js')
    expect(results[5].toString()).toEqual('https://google.com/post-me')
    expect(results[6].toString()).toEqual('http://some-iframe.test.com/')
  })

  it('scans data-href attributes too', async () => {
    const parser = new CheerioParser({
      include: ['[data-href]'],
    })

    const req = new Request('https://google.com')
    const resp = new Response(`
      <html>
        <body>
          <div data-href="http://test.com"
        </body>
      </html>
      `)
    const results: URL[] = []
    await parser.parse(resp, req, (result) => results.push(result))

    expect(results.length).toEqual(1)
    expect(results[0].toString()).toEqual('http://test.com/')
  })
})

// tslint:disable:max-line-length
const rawGoogleHtml = `
<!doctype html><html itemscope="" itemtype="http://schema.org/WebPage" lang="en"><head><meta content="Search the world's information, including webpages, images, videos and more. Google has many special features to help you find exactly what you're looking for." name="description"><meta content="noodp" name="robots"><meta content="text/html; charset=UTF-8" http-equiv="Content-Type"><meta content="/images/branding/googleg/1x/googleg_standard_color_128dp.png" itemprop="image"><title>Google</title><script nonce="5G8JjD9iymwOtFBDexjFGQ==">(function(){window.google={kEI:'8B3fXICRKcG-tQX83KagDA',kEXPI:'0,18168,1335579,57,1957,2423,698,527,730,224,1223,352,1258,1893,378,98,109,1017,166,439,100,338,144,2332423,329514,1294,12383,4855,32691,15248,867,12163,6381,3335,2,2,4605,2196,369,3314,5505,224,2218,260,5110,101,471,835,284,2,1306,2431,59,2,1,3,1296,1,4323,3700,1268,773,2254,1403,3337,1146,5,2,2,1494,253,216,2484,111,3601,669,1045,1,1812,1397,81,7,1,2,488,620,29,1395,3610,4137,1162,1288,2,4007,796,1220,38,920,754,119,1217,1210,154,1416,195,2736,1663,164,1234,2,631,2562,2,4,2,670,44,1767,607,1774,510,124,1162,1446,12,620,1139,1089,655,17,322,1592,389,142,86,2,961,198,403,374,1,369,1016,300,705,756,98,404,18,399,992,509,598,10,169,7,109,187,831,235,810,450,174,813,154,48,459,94,11,14,10,930,38,693,837,70,386,146,174,1,196,10,25,177,323,5,55,736,461,66,90,142,28,215,299,92,1,231,193,532,70,191,6,103,274,24,227,22,3,14,18,22,18,107,49,444,1127,328,258,73,68,25,959,153,665,260,213,974,1,3,7,7,1,2,185,970,97,240,554,522,84,638,127,13,191,164,184,193,1,202,117,765,534,2,570,258,718,4,306,84,531,1,25,165,90,169,1,429,5935434,2885,34,29,5997527,34,2799830,4,1572,549,333,444,1,2,80,1,900,583,9,304,1,8,1,2,2132,1,1,1,1,1,414,1,748,141,59,726,3,7,563,1,1977,98,36,26,1,9,9,30,11,11,3,11,22304916',authuser:0,kscs:'c9c918f0_8B3fXICRKcG-tQX83KagDA',kGL:'US'};google.sn='webhp';google.kHL='en';})();(function(){google.lc=[];google.li=0;google.getEI=function(a){for(var b;a&&(!a.getAttribute||!(b=a.getAttribute("eid")));)a=a.parentNode;return b||google.kEI};google.getLEI=function(a){for(var b=null;a&&(!a.getAttribute||!(b=a.getAttribute("leid")));)a=a.parentNode;return b};google.https=function(){return"https:"==window.location.protocol};google.ml=function(){return null};google.time=function(){return(new Date).getTime()};google.log=function(a,b,e,c,g){if(a=google.logUrl(a,b,e,c,g)){b=new Image;var d=google.lc,f=google.li;d[f]=b;b.onerror=b.onload=b.onabort=function(){delete d[f]};google.vel&&google.vel.lu&&google.vel.lu(a);b.src=a;google.li=f+1}};google.logUrl=function(a,b,e,c,g){var d="",f=google.ls||"";e||-1!=b.search("&ei=")||(d="&ei="+google.getEI(c),-1==b.search("&lei=")&&(c=google.getLEI(c))&&(d+="&lei="+c));c="";!e&&google.cshid&&-1==b.search("&cshid=")&&"slh"!=a&&(c="&cshid="+google.cshid);a=e||"/"+(g||"gen_204")+"?atyp=i&ct="+a+"&cad="+b+d+f+"&zx="+google.time()+c;/^http:/i.test(a)&&google.https()&&(google.ml(Error("a"),!1,{src:a,glmm:1}),a="");return a};}).call(this);(function(){google.y={};google.x=function(a,b){if(a)var c=a.id;else{do c=Math.random();while(google.y[c])}google.y[c]=[a,b];return!1};google.lm=[];google.plm=function(a){google.lm.push.apply(google.lm,a)};google.lq=[];google.load=function(a,b,c){google.lq.push([[a],b,c])};google.loadAll=function(a,b){google.lq.push([a,b])};}).call(this);google.f={};var a=window.location,b=a.href.indexOf("#");if(0<=b){var c=a.href.substring(b+1);/(^|&)q=/.test(c)&&-1==c.indexOf("#")&&a.replace("/search?"+c.replace(/(^|&)fp=[^&]*/g,"")+"&cad=h")};</script><style>#gbar,#guser{font-size:13px;padding-top:1px !important;}#gbar{height:22px}#guser{padding-bottom:7px !important;text-align:right}.gbh,.gbd{border-top:1px solid #c9d7f1;font-size:1px}.gbh{height:0;position:absolute;top:24px;width:100%}@media all{.gb1{height:22px;margin-right:.5em;vertical-align:top}#gbar{float:left}}a.gb1,a.gb4{text-decoration:underline !important}a.gb1,a.gb4{color:#00c !important}.gbi .gb4{color:#dd8e27 !important}.gbf .gb4{color:#900 !important}
</style><style>body,td,a,p,.h{font-family:arial,sans-serif}body{margin:0;overflow-y:scroll}#gog{padding:3px 8px 0}td{line-height:.8em}.gac_m td{line-height:17px}form{margin-bottom:20px}.h{color:#36c}.q{color:#00c}.ts td{padding:0}.ts{border-collapse:collapse}em{font-weight:bold;font-style:normal}.lst{height:25px;width:496px}.gsfi,.lst{font:18px arial,sans-serif}.gsfs{font:17px arial,sans-serif}.ds{display:inline-box;display:inline-block;margin:3px 0 4px;margin-left:4px}input{font-family:inherit}a.gb1,a.gb2,a.gb3,a.gb4{color:#11c !important}body{background:#fff;color:black}a{color:#11c;text-decoration:none}a:hover,a:active{text-decoration:underline}.fl a{color:#36c}a:visited{color:#551a8b}a.gb1,a.gb4{text-decoration:underline}a.gb3:hover{text-decoration:none}#ghead a.gb2:hover{color:#fff !important}.sblc{padding-top:5px}.sblc a{display:block;margin:2px 0;margin-left:13px;font-size:11px}.lsbb{background:#eee;border:solid 1px;border-color:#ccc #999 #999 #ccc;height:30px}.lsbb{display:block}.ftl,#fll a{display:inline-block;margin:0 12px}.lsb{background:url(/images/nav_logo229.png) 0 -261px repeat-x;border:none;color:#000;cursor:pointer;height:30px;margin:0;outline:0;font:15px arial,sans-serif;vertical-align:top}.lsb:active{background:#ccc}.lst:focus{outline:none}</style><script nonce="5G8JjD9iymwOtFBDexjFGQ=="></script></head><body bgcolor="#fff"><script nonce="5G8JjD9iymwOtFBDexjFGQ==">(function(){var src='/images/nav_logo229.png';var iesg=false;document.body.onload = function(){window.n && window.n();if (document.images){new Image().src=src;}
if (!iesg){document.f&&document.f.q.focus();document.gbqf&&document.gbqf.q.focus();}
}
})();</script><div id="mngb"> <div id=gbar><nobr><b class=gb1>Search</b> <a class=gb1 href="http://www.google.com/imghp?hl=en&tab=wi">Images</a> <a class=gb1 href="http://maps.google.com/maps?hl=en&tab=wl">Maps</a> <a class=gb1 href="https://play.google.com/?hl=en&tab=w8">Play</a> <a class=gb1 href="http://www.youtube.com/?gl=US&tab=w1">YouTube</a> <a class=gb1 href="http://news.google.com/nwshp?hl=en&tab=wn">News</a> <a class=gb1 href="https://mail.google.com/mail/?tab=wm">Gmail</a> <a class=gb1 href="https://drive.google.com/?tab=wo">Drive</a> <a class=gb1 style="text-decoration:none" href="https://www.google.com/intl/en/about/products?tab=wh"><u>More</u> &raquo;</a></nobr></div><div id=guser width=100%><nobr><span id=gbn class=gbi></span><span id=gbf class=gbf></span><span id=gbe></span><a href="http://www.google.com/history/optout?hl=en" class=gb4>Web History</a> | <a  href="/preferences?hl=en" class=gb4>Settings</a> | <a target=_top id=gb_70 href="https://accounts.google.com/ServiceLogin?hl=en&passive=true&continue=http://www.google.com/" class=gb4>Sign in</a></nobr></div><div class=gbh style=left:0></div><div class=gbh style=right:0></div> </div><center><br clear="all" id="lgpd"><div id="lga"><img alt="Google" height="92" src="/images/branding/googlelogo/1x/googlelogo_white_background_color_272x92dp.png" style="padding:28px 0 14px" width="272" id="hplogo" onload="window.lol&&lol()"><br><br></div><form action="/search" name="f"><table cellpadding="0" cellspacing="0"><tr valign="top"><td width="25%">&nbsp;</td><td align="center" nowrap=""><input name="ie" value="ISO-8859-1" type="hidden"><input value="en" name="hl" type="hidden"><input name="source" type="hidden" value="hp"><input name="biw" type="hidden"><input name="bih" type="hidden"><div class="ds" style="height:32px;margin:4px 0"><input style="color:#000;margin:0;padding:5px 8px 0 6px;vertical-align:top" autocomplete="off" class="lst" value="" title="Google Search" maxlength="2048" name="q" size="57"></div><br style="line-height:0"><span class="ds"><span class="lsbb"><input class="lsb" value="Google Search" name="btnG" type="submit"></span></span><span class="ds"><span class="lsbb"><input class="lsb" value="I'm Feeling Lucky" name="btnI" onclick="if(this.form.q.value)this.checked=1; else top.location='/doodles/'" type="submit"></span></span></td><td class="fl sblc" align="left" nowrap="" width="25%"><a href="/advanced_search?hl=en&amp;authuser=0">Advanced search</a><a href="/language_tools?hl=en&amp;authuser=0">Language tools</a></td></tr></table><input id="gbv" name="gbv" type="hidden" value="1"><script nonce="5G8JjD9iymwOtFBDexjFGQ==">(function(){var a,b="1";if(document&&document.getElementById)if("undefined"!=typeof XMLHttpRequest)b="2";else if("undefined"!=typeof ActiveXObject){var c,d,e=["MSXML2.XMLHTTP.6.0","MSXML2.XMLHTTP.3.0","MSXML2.XMLHTTP","Microsoft.XMLHTTP"];for(c=0;d=e[c++];)try{new ActiveXObject(d),b="2"}catch(h){}}a=b;if("2"==a&&-1==location.search.indexOf("&gbv=2")){var f=google.gbvu,g=document.getElementById("gbv");g&&(g.value=a);f&&window.setTimeout(function(){location.href=f},0)};}).call(this);</script></form><div id="gac_scont"></div><div style="font-size:83%;min-height:3.5em"><br><div id="prm"><style>.szppmdbYutt__middle-slot-promo{font-size:small;margin-bottom:32px}.szppmdbYutt__middle-slot-promo a.ZIeIlb{display:inline-block;text-decoration:none}.szppmdbYutt__middle-slot-promo img{border:none;margin-right:5px;vertical-align:middle}</style><div class="szppmdbYutt__middle-slot-promo" data-ved="0ahUKEwiAyeb0t6PiAhVBX60KHXyuCcQQnIcBCAQ"><a class="NKcBbd" href="https://www.google.com/url?q=https://economicimpact.google.com/reports/tx%3Futm_source%3Dgoogle%26utm_medium%3Dhp%26utm_campaign%3Dlaunch&amp;source=hpp&amp;id=19012225&amp;ct=3&amp;usg=AFQjCNE1KJ_SvY3fYav4Fcu8Y5rwMZ-dGg&amp;sa=X&amp;ved=0ahUKEwiAyeb0t6PiAhVBX60KHXyuCcQQ8IcBCAU" rel="nofollow">Explore Google's impact on businesses in Texas</a></div></div></div><span id="footer"><div style="font-size:10pt"><div style="margin:19px auto;text-align:center" id="fll"><a href="/intl/en/ads/">Advertising�Programs</a><a href="/services/">Business Solutions</a><a href="/intl/en/about.html">About Google</a></div></div><p style="color:#767676;font-size:8pt">&copy; 2019 - <a href="/intl/en/policies/privacy/">Privacy</a> - <a href="/intl/en/policies/terms/">Terms</a></p></span></center><script nonce="5G8JjD9iymwOtFBDexjFGQ==">(function(){window.google.cdo={height:0,width:0};(function(){var a=window.innerWidth,b=window.innerHeight;if(!a||!b){var c=window.document,d="CSS1Compat"==c.compatMode?c.documentElement:c.body;a=d.clientWidth;b=d.clientHeight}a&&b&&(a!=google.cdo.width||b!=google.cdo.height)&&google.log("","","/client_204?&atyp=i&biw="+a+"&bih="+b+"&ei="+google.kEI);}).call(this);})();(function(){var u='/xjs/_/js/k\x3dxjs.hp.en_US.WHDCcovrDNM.O/m\x3dsb_he,d/am\x3dYFAL/d\x3d1/rs\x3dACT90oHQJgr87UhQ0q_n5wN9vekOnhZLjg';setTimeout(function(){var a=document.createElement("script");a.src=u;google.timers&&google.timers.load&&google.tick&&google.tick("load","xjsls");document.body.appendChild(a)},0);})();(function(){window.google.xjsu='/xjs/_/js/k\x3dxjs.hp.en_US.WHDCcovrDNM.O/m\x3dsb_he,d/am\x3dYFAL/d\x3d1/rs\x3dACT90oHQJgr87UhQ0q_n5wN9vekOnhZLjg';})();function _DumpException(e){throw e;}
(function(){google.spjs=false;})();google.sm=1;(function(){var pmc='{\x22Qnk92g\x22:{},\x22RWGcrA\x22:{},\x22U5B21g\x22:{},\x22YFCs/g\x22:{},\x22ZI/YVQ\x22:{},\x22d\x22:{},\x22sb_he\x22:{\x22agen\x22:true,\x22cgen\x22:true,\x22client\x22:\x22heirloom-hp\x22,\x22dh\x22:true,\x22dhqt\x22:true,\x22ds\x22:\x22\x22,\x22ffql\x22:\x22en\x22,\x22fl\x22:true,\x22host\x22:\x22google.com\x22,\x22isbh\x22:28,\x22jsonp\x22:true,\x22msgs\x22:{\x22cibl\x22:\x22Clear Search\x22,\x22dym\x22:\x22Did you mean:\x22,\x22lcky\x22:\x22I\\u0026#39;m Feeling Lucky\x22,\x22lml\x22:\x22Learn more\x22,\x22oskt\x22:\x22Input tools\x22,\x22psrc\x22:\x22This search was removed from your \\u003Ca href\x3d\\\x22/history\\\x22\\u003EWeb History\\u003C/a\\u003E\x22,\x22psrl\x22:\x22Remove\x22,\x22sbit\x22:\x22Search by image\x22,\x22srch\x22:\x22Google Search\x22},\x22ovr\x22:{},\x22pq\x22:\x22\x22,\x22refpd\x22:true,\x22rfs\x22:[],\x22sbpl\x22:24,\x22sbpr\x22:24,\x22scd\x22:10,\x22sce\x22:5,\x22stok\x22:\x22MRqBiceiZQQekeJvd9BacwyF1y4\x22,\x22uhde\x22:false}}';google.pmc=JSON.parse(pmc);})();</script>        </body></html>
`
