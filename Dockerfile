FROM oven/bun:debian

RUN apt-get update && apt-get install -y chromium jq

RUN ln -s /usr/bin/chromium /usr/bin/chromium-browser

RUN mkdir /usr/app
WORKDIR /usr/app

COPY package*.json ./
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1
RUN bun install

COPY . .

RUN chmod a+x run.sh
CMD ./run.sh