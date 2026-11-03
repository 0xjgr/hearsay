#!/bin/sh
# note: runs the toolkit agent over the corpus in four configurations; rerun to resume
set -e
cd "$(dirname "$0")/.."
node bench/run-toolkit-corpus.ts --resume
node bench/run-toolkit-corpus.ts --resume --guard
MODEL_NAME=qwen2.5:7b-instruct MODEL_REASONING=none node bench/run-toolkit-corpus.ts --resume
MODEL_NAME=qwen2.5:7b-instruct MODEL_REASONING=none node bench/run-toolkit-corpus.ts --resume --guard
