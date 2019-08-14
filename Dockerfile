FROM node:12-alpine

WORKDIR /linkscanner/

ADD package.json yarn.lock /linkscanner/
RUN yarn

ADD vendor /linkscanner/vendor
ADD bin /linkscanner/bin
ADD @types /linkscanner/@types
ADD src /linkscanner/src
ADD tsconfig.json /linkscanner/

RUN yarn build

ENTRYPOINT ["/linkscanner/bin/linkscanner"]