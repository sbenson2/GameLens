#!/usr/bin/env python3
"""Run the eval suite against OpenAI Codex with promptfoo.

  codex_evals.py build                      write configs and working dirs under build/codex-eval/
  codex_evals.py run [--suite S] [--repeat N]   run trigger, quality or all (default all, repeat 2)
  codex_evals.py summarize                  report per-arm pass rates from the latest results

Reuses the prompts, rubrics and registry-derived URL patterns of the
`claude plugin eval` suite in evals/, so both harnesses test the same thing.

Isolation: each run uses the real CODEX_HOME (so the ChatGPT login keeps
working; copying auth.json risks rotating its refresh token) with HOME
pointed at an empty directory, which hides user-level ~/.agents/skills.
The with-skill arm works in a directory whose .agents/skills holds a copy
of the skill; the without-skill arm works in an empty directory. MCP
servers are disabled for the runs. Setup once: `npm install promptfoo
@openai/codex-sdk @anthropic-ai/claude-agent-sdk` in build/codex-eval/.
Rubrics are judged by Sonnet through the Claude Agent SDK (Claude Code login).
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sourcelib as lib  # noqa: E402
from eval_url_graders import alternation  # noqa: E402

BUILD = lib.ROOT / 'build' / 'codex-eval'
EVALS = lib.ROOT / 'evals'
MODEL, EFFORT = 'gpt-6-sol', 'medium'


def cases():
    for prompt in sorted(EVALS.glob('*/prompt.md')):
        text = prompt.read_text()
        _, front, body = text.split('---', 2)
        tags = re.search(r'^tags:\s*\[(.*)\]', front, re.M)[1]
        rubric = prompt.parent / 'graders' / 'advice.md'
        yield {'name': prompt.parent.name, 'tags': [t.strip() for t in tags.split(',')],
               'prompt': body.strip(),
               'rubric': rubric.read_text().split('---', 2)[2].strip() if rubric.is_file() else None}


def provider(label, workdir):
    codex = shutil.which('codex') or 'codex'
    return {'id': 'openai:codex-sdk', 'label': label, 'config': {
        'model': MODEL, 'model_reasoning_effort': EFFORT, 'working_dir': str(workdir),
        'skip_git_repo_check': True, 'sandbox_mode': 'read-only', 'approval_policy': 'never',
        'enable_streaming': True, 'codex_path_override': codex,
        'cli_env': {'HOME': str(BUILD / 'home'), 'CODEX_HOME': str(Path.home() / '.codex'),
                    'PATH': os.environ.get('PATH', '')},
        'cli_config': {'mcp_servers': {}}}}


def build():
    work = BUILD / 'work'
    shutil.rmtree(work, ignore_errors=True)
    shutil.rmtree(BUILD / 'home', ignore_errors=True)
    (work / 'with' / '.agents' / 'skills').mkdir(parents=True)
    (work / 'without').mkdir(parents=True)
    (BUILD / 'home').mkdir()
    shutil.copytree(lib.SKILL, work / 'with' / '.agents' / 'skills' / 'game-development',
                    ignore=shutil.ignore_patterns('__pycache__'))
    entries, _ = lib.load(lib.REGISTRY)
    allowed = alternation(entries)
    cites = r'https?:\/\/(?:' + allowed + ')'
    unlisted = r'https?:\/\/(?!(?:' + allowed + r'))[^\s)\]>"' + "'" + r'`]+'
    judge = {'id': 'anthropic:claude-agent-sdk', 'config': {'model': 'sonnet', 'max_turns': 1, 'apiKeyRequired': False}}
    trigger_tests, quality_tests = [], []
    for case in cases():
        base = {'description': case['name'], 'vars': {'request': case['prompt']},
                'metadata': {'case': case['name']}}
        if 'trigger' in case['tags']:
            kind = 'not-skill-used' if 'should-not-fire' in case['tags'] else 'skill-used'
            trigger_tests.append({**base, 'assert': [{'type': kind, 'value': 'game-development', 'metric': kind}]})
        elif 'quality' in case['tags']:
            quality_tests.append({**base, 'assert': [
                {'type': 'javascript', 'metric': 'cites-registry-source',
                 'value': f'new RegExp({json.dumps(cites)}, "i").test(String(output))'},
                {'type': 'javascript', 'metric': 'no-unlisted-urls',
                 'value': f'!new RegExp({json.dumps(unlisted)}, "i").test(String(output))'},
                {'type': 'llm-rubric', 'metric': 'advice', 'value': case['rubric'], 'provider': judge}]})
    with_skill = provider('codex-with-skill', work / 'with')
    without_skill = provider('codex-without-skill', work / 'without')
    for name, providers, tests in (('trigger', [with_skill], trigger_tests),
                                   ('quality', [with_skill, without_skill], quality_tests)):
        config = {'description': f'game-development {name} suite on Codex', 'prompts': ['{{request}}'],
                  'providers': providers, 'defaultTest': {'options': {'disableVarExpansion': True}},
                  'tests': tests}
        (BUILD / f'{name}.json').write_text(json.dumps(config, indent=1))
    print(f'wrote {len(trigger_tests)} trigger and {len(quality_tests)} quality tests to {BUILD}')


def run(suite, repeat):
    env = {**os.environ, 'PROMPTFOO_CACHE_ENABLED': 'false'}
    for name in (['trigger', 'quality'] if suite == 'all' else [suite]):
        out = BUILD / f'results-{name}.json'
        subprocess.run(['npx', 'promptfoo', 'eval', '-c', f'{name}.json', '--repeat', str(repeat),
                        '-j', '3', '-o', str(out), '--no-progress-bar'], cwd=BUILD, env=env, check=False)


def summarize():
    for name in ('trigger', 'quality'):
        path = BUILD / f'results-{name}.json'
        if not path.is_file():
            continue
        rows = json.loads(path.read_text())['results']['results']
        tally = defaultdict(lambda: [0, 0])
        misses = defaultdict(int)
        for row in rows:
            arm = row['provider'].get('label') or row['provider'].get('id')
            for part in (row.get('gradingResult') or {}).get('componentResults') or []:
                metric = part['assertion'].get('metric') or part['assertion']['type']
                tally[(arm, metric)][0] += bool(part['pass'])
                tally[(arm, metric)][1] += 1
                if name == 'trigger' and not part['pass']:
                    misses[row['metadata'].get('case', '?')] += 1
            calls = ((row.get('response') or {}).get('metadata') or {}).get('skillCalls') or []
            if name == 'quality':
                fired = any(c.get('name') == 'game-development' for c in calls)
                tally[(arm, 'skill-fired')][0] += fired
                tally[(arm, 'skill-fired')][1] += 1
            if (row.get('response') or {}).get('error'):
                tally[(arm, 'provider-errors')][0] += 1
                tally[(arm, 'provider-errors')][1] += 1
        print(f'== codex {name} ({MODEL}, reasoning {EFFORT})')
        for (arm, metric), (passed, total) in sorted(tally.items()):
            print(f'  {arm:22} {metric:24} {passed}/{total}')
        if misses:
            print('  misses: ' + ', '.join(f'{k} x{v}' for k, v in sorted(misses.items())))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('build')
    runner = sub.add_parser('run')
    runner.add_argument('--suite', choices=('trigger', 'quality', 'all'), default='all')
    runner.add_argument('--repeat', type=int, default=2)
    sub.add_parser('summarize')
    args = parser.parse_args()
    if args.command == 'build':
        build()
    elif args.command == 'run':
        run(args.suite, args.repeat)
    else:
        summarize()
    return 0


if __name__ == '__main__':
    sys.exit(main())
