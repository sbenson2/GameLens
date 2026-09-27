#!/usr/bin/env bash
# Run the plugin eval suite against a clean staged copy of the plugin.
# The repo holds a large gitignored research corpus, and `claude plugin eval`
# refuses to scan a plugin directory with more than 20,000 entries, so the
# manifest, skills/ and evals/ are copied to build/plugin-eval first.
#
#   tools/run_evals.sh <tag> <model> [extra `claude plugin eval` options]
#   tools/run_evals.sh trigger haiku --ablation none --runs 2
#   tools/run_evals.sh quality sonnet --judge-model sonnet --runs 2
#
# Results: build/eval-results/<time>-<tag>-<model>/ (report.html, result.json)
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
tag="$1"; model="$2"; shift 2
stage="$root/build/plugin-eval"
out="$root/build/eval-results/$(date +%Y%m%dT%H%M%S)-$tag-$model"
rm -rf "$stage"; mkdir -p "$stage" "$out"
cp -R "$root/.claude-plugin" "$root/skills" "$root/evals" "$stage/"
rm -rf "$stage/evals/results"
find "$stage" -name __pycache__ -prune -exec rm -rf {} +
cd "$stage"
claude plugin eval . --tag "$tag" --model "$model" --no-publish --trust-plugin \
  --output-dir "$out" --json "$out/result.json" "$@" || status=$?
echo "$out"
exit "${status:-0}"
