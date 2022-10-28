FROM node:16 AS builder

WORKDIR /linkscanner/

ADD . /linkscanner/
RUN yarn

RUN yarn build

FROM node:16-alpine

ENV NODE_ENV=production

WORKDIR /linkscanner/

ADD package.json yarn.lock README.md /linkscanner/
RUN yarn install --production

ADD vendor /linkscanner/vendor
ADD bin /linkscanner/bin
ADD src /linkscanner/src
COPY --from=0 /linkscanner/dist /linkscanner/dist

ENTRYPOINT ["/linkscanner/bin/linkscanner"]

