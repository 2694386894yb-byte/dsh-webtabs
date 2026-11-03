#!/bin/bash
set -u
cd "$(dirname "$0")" || exit 1
bash "bin/web-start.sh"
