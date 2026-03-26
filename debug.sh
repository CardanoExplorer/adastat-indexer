#!/usr/bin/bash

npm run debug

#pm2 stop AdaStatParser; pm2 start "npm run debug" --name AdaStatParser --only development --no-daemon