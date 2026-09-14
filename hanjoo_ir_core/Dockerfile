FROM alpine:3.22

RUN apk add --no-cache nodejs npm ca-certificates git g++ make \
 && rm -rf /tmp/irtxrx-src /opt/hanjoo \
 && git clone --depth 1 --branch v0.21.0 https://github.com/0xPiyush/irtxrx.git /tmp/irtxrx-src \
 && cd /tmp/irtxrx-src \
 && npm install --ignore-scripts --no-audit --no-fund \
 && ./node_modules/.bin/tsc -p tsconfig.build.json \
 && ./node_modules/.bin/tsc -p tsconfig.cjs.json \
 && test -f dist/cjs/index.js \
 && test -f dist/cjs/encode.js \
 && test -f dist/cjs/decode.js \
 && printf '{"type":"commonjs"}' > dist/cjs/package.json \
 && mkdir -p /tmp/hanjoo-pack /opt/hanjoo \
 && npm pack --pack-destination /tmp/hanjoo-pack \
 && cd / \
 && printf '{"name":"hanjoo-ir-core-runtime","private":true}' > /opt/hanjoo/package.json \
 && npm install --prefix /opt/hanjoo --omit=dev --ignore-scripts --no-audit --no-fund /tmp/hanjoo-pack/irtxrx-0.21.0.tgz \
 && rm -rf /tmp/irtxrx-src /tmp/hanjoo-pack \
 && node -e "const {createRequire}=require('node:module');const r=createRequire('/opt/hanjoo/package.json');const m=r('irtxrx');if(!m||!m.encode||!m.decode||!m.PROTOCOLS)process.exit(42);console.log('irtxrx runtime OK, protocols='+m.PROTOCOLS.length)"

COPY ir8266_probe.cpp /tmp/hanjoo-ir8266-probe.cpp

RUN git clone --depth 1 https://github.com/crankyoldgit/IRremoteESP8266.git /tmp/irremoteesp8266 \
 && cd /tmp/irremoteesp8266 \
 && git fetch --depth 1 origin 1e2f0f3ef0a93cbf2a8ddb2e95130f8f4c584b3f \
 && git checkout 1e2f0f3ef0a93cbf2a8ddb2e95130f8f4c584b3f \
 && test -f /tmp/irremoteesp8266/test/IRsend_test.h \
 && test -f /tmp/irremoteesp8266/test/IRrecv_test.h \
 && g++ -O2 -std=gnu++11 -DUNIT_TEST -D_IR_LOCALE_=en-AU \
      -I/tmp/irremoteesp8266/src \
      -I/tmp/irremoteesp8266/test \
      /tmp/hanjoo-ir8266-probe.cpp \
      /tmp/irremoteesp8266/src/IRrecv.cpp \
      /tmp/irremoteesp8266/src/IRsend.cpp \
      /tmp/irremoteesp8266/src/IRtimer.cpp \
      /tmp/irremoteesp8266/src/IRutils.cpp \
      /tmp/irremoteesp8266/src/IRtext.cpp \
      /tmp/irremoteesp8266/src/ir_*.cpp \
      -o /opt/hanjoo/ir8266_probe \
 && strip /opt/hanjoo/ir8266_probe \
 && cd / \
 && rm -rf /tmp/irremoteesp8266 /tmp/hanjoo-ir8266-probe.cpp \
 && apk del git g++ make \
 && npm cache clean --force

COPY core_payload/ /opt/hanjoo/payload/
COPY core_runtime.protected.cjs /opt/hanjoo/core_runtime.cjs
COPY probe_server.cjs /opt/hanjoo/probe_server.cjs
COPY run.sh /run.sh
RUN chmod 755 /run.sh

ENV NODE_PATH=/opt/hanjoo/node_modules
EXPOSE 8099 8101
CMD ["/run.sh"]
