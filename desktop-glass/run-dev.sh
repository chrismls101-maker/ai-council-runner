#!/bin/bash
unset ELECTRON_RUN_AS_NODE
cd "$(dirname "$0")"
npm run dev
