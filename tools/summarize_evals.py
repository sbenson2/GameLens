#!/usr/bin/env python3
"""Summarize `claude plugin eval` results written by tools/run_evals.sh.

  summarize_evals.py [results_dir ...]   default: every build/eval-results/*/

Trigger suites report, per model, how often the skill fired on prompts that
should fire it (recall) and on near misses that should not (false triggers).
Quality suites report each grader's pass rate with and without the skill.
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(paths):
    for directory in paths:
        result = Path(directory) / 'result.json'
        if result.is_file():
            name = Path(directory).name.split('-', 1)[1]  # <tag>-<model>
            yield name, json.loads(result.read_text())


def trigger(name, data):
    fired = {'should-fire': [0, 0], 'should-not-fire': [0, 0]}
    misses = []
    for case in data['cases']:
        kind = 'should-not-fire' if case['name'].startswith('skip-') else 'should-fire'
        for run in case['arms']['with']:
            grader = run['graders'][0]
            calls = grader['explanation']
            skill_called = not calls.startswith('Skill called 0x')
            fired[kind][0] += skill_called
            fired[kind][1] += 1
            if grader['passed'] is False:
                misses.append(case['name'])
    hit, total = fired['should-fire']
    false_hits, false_total = fired['should-not-fire']
    print(f'{name:20} fired on {hit}/{total} should-fire runs ({hit / max(total, 1):.0%}); '
          f'false triggers {false_hits}/{false_total}; cost ${data.get("costUsd", 0):.2f}'
          + (' [PARTIAL]' if data.get('partial') else ''))
    if misses:
        counts = defaultdict(int)
        for miss in misses:
            counts[miss] += 1
        print('    misses: ' + ', '.join(f'{k} x{v}' for k, v in sorted(counts.items())))


def quality(name, data):
    tallies = defaultdict(lambda: defaultdict(lambda: [0, 0]))
    for case in data['cases']:
        for arm, runs in case['arms'].items():
            for run in runs:
                for grader in run['graders']:
                    tally = tallies[grader['name']][arm]
                    tally[0] += bool(grader['passed'])
                    tally[1] += 1
    agg = data.get('aggregates', {})
    print(f'{name:20} overall {agg.get("overallScore", 0):.2f}, mean delta {agg.get("meanDelta", 0):+.2f}; '
          f'cost ${data.get("costUsd", 0):.2f}' + (' [PARTIAL]' if data.get('partial') else ''))
    for grader, arms in sorted(tallies.items()):
        cells = [f'{arm} {p}/{t}' for arm, (p, t) in sorted(arms.items())]
        print(f'    {grader:24} ' + '  '.join(cells))
    for case in data['cases']:
        a = case['aggregates']
        errors = [r['error'] for r in case['arms']['with'] if r.get('error')]
        print(f'      {case["name"]:28} with {a.get("score", 0):.2f}  delta {a.get("delta", 0):+.2f}'
              + (f'  errors: {errors[0][:60]}' if errors else ''))


def main():
    paths = sys.argv[1:] or sorted(str(p) for p in (ROOT / 'build' / 'eval-results').glob('*/'))
    for name, data in load(paths):
        (trigger if name.startswith('trigger') else quality)(name, data)
    return 0


if __name__ == '__main__':
    sys.exit(main())
