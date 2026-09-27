#!/usr/bin/env python3
"""Run the eval suite against an agent CLI: Codex, opencode, Qwen Code or any other.

  agent_evals.py run --agent codex|opencode|qwen [options] [-- extra agent args]
  agent_evals.py run --cmd 'gemini -o stream-json -p {prompt}' --name gemini [options]
  agent_evals.py run --agent codex --pointer AGENTS.md [options]   skill reached through a pointer
  agent_evals.py summarize [results.jsonl ...]   default: every run in build/agent-evals/

Options for run: --model M, --suite trigger|quality|all, --repeat N, --case TEXT
(repeatable), --jobs N, --env KEY=VALUE (repeatable), --skills-dir DIR,
--pointer FILE, --judge CMD, --no-judge.

The cases are the ones in evals/, which `claude plugin eval` runs for Claude
Code: prompts that should load the skill, near misses that should not, and
quality questions with rubrics.

Isolation: every run is a fresh session in its own scratch directory outside
this repository. The directory is initialized as a git repository so the
agent treats it as the project root; a directory inside this repo would expose
its AGENTS.md, which describes the skill. In the with-skill arm the directory
holds a copy of the skill under --skills-dir (default .agents/skills, the
shared folder most agents read); in the without-skill arm it is empty. The
built-in profiles also hide user-level skills. With --cmd, remove any other
installed copy of the skill first, or the arms are not independent.

--pointer tests the setup for agents without skill support: the with-skill
directory holds the skill at docs/game-development, outside any skills
folder, and FILE (for example AGENTS.md) holds POINTER, the snippet the README
gives for such agents.

Grading: a run loaded the skill when the agent's output shows a read of the
skill's files or a skill call naming it, so the agent must print its tool
calls (a JSON event stream). Should-fire runs stop as soon as the skill loads.
A quality reply passes the link checks when it links at least one registered
source and no URL outside the registry. It passes the advice check when the
judge finds that it meets the case's rubric. The judge is any command that
reads the grading prompt on stdin; the default is Claude Code running Sonnet
with no tools.
"""
import argparse
import datetime
import json
import os
import re
import shlex
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sourcelib as lib  # noqa: E402
from eval_url_graders import url_patterns  # noqa: E402

EVALS = lib.ROOT / 'evals'
RESULTS = lib.ROOT / 'build' / 'agent-evals'
JUDGE = 'claude -p --safe-mode --tools "" --model sonnet --no-session-persistence'
LOADED = re.compile(r'game-development[\\/]+(?:SKILL\.md|references[\\/]|scripts[\\/])'
                    r'|"(?:name|skill|skill_name|skillName)"\s*:\s*"(?:[\w-]+:)?game-development"')
SKILL_PATH = re.compile(r'([^\s"\'`<>]*game-development)[\\/]+(?:SKILL\.md|references|scripts)')
SETUP_EVENTS = {'system', 'init', 'thread.started', 'session.created'}
POINTER = """## Game development

When designing, reviewing or diagnosing a game, writing or changing gameplay code (player movement, jumps, cameras, combat, enemy AI, inventories, saves), or looking for GDC talks or research on a game-design question, first read `docs/game-development/SKILL.md` and follow it. Paths in it are relative to that folder. Skip it for tasks that only involve games in passing, such as game trivia, tool setup, or code that is not part of a game.
"""
JUDGE_PROMPT = """You are grading one reply from an AI coding agent to a game developer.

<request>
{request}
</request>

<reply>
{reply}
</reply>

<rubric>
{rubric}
</rubric>

Decide whether the reply meets the rubric. Judge only what the rubric asks about. Respond with one line of JSON and nothing else: {{"pass": true or false, "reason": "<one sentence>"}}"""


def empty_home(home):
    """HOME and the XDG directories pointed at an empty directory."""
    return {'HOME': home, 'XDG_CONFIG_HOME': f'{home}/.config', 'XDG_DATA_HOME': f'{home}/.local/share',
            'XDG_CACHE_HOME': f'{home}/.cache', 'XDG_STATE_HOME': f'{home}/.local/state'}


def codex_env(home):
    # An empty HOME hides ~/.agents/skills. CODEX_HOME stays real so the login
    # works; copying auth.json can rotate its refresh token.
    return {'HOME': home, 'CODEX_HOME': os.environ.get('CODEX_HOME', str(Path.home() / '.codex'))}


def opencode_env(home):
    # Empty home and XDG directories hide user skills, config and MCP servers;
    # opencode reads its home from OPENCODE_TEST_HOME, not HOME. The stored
    # provider keys are passed in memory rather than copied.
    env = {**empty_home(home), 'OPENCODE_TEST_HOME': home}
    data = Path(os.environ.get('XDG_DATA_HOME') or Path.home() / '.local' / 'share')
    auth = data / 'opencode' / 'auth.json'
    if auth.is_file():
        env['OPENCODE_AUTH_CONTENT'] = auth.read_text()
    return env


PROFILES = {
    'codex': {'cmd': ['codex', 'exec', '--json', '--skip-git-repo-check', '--sandbox', 'read-only',
                      '--ignore-user-config', '--ephemeral'],
              'prompt': ['{prompt}'], 'env': codex_env},
    'opencode': {'cmd': ['opencode', 'run', '--format', 'json'], 'prompt': ['{prompt}'], 'env': opencode_env},
    # Qwen Code keeps its own settings. A workspace setting turns off user-level
    # and extension skills and pre-approves the skill tool, which headless runs
    # cannot otherwise approve.
    'qwen': {'cmd': ['qwen', '-o', 'stream-json'], 'prompt': ['-p', '{prompt}'],
             'files': {'.qwen/settings.json': json.dumps({'skills': {'disabledLevels': ['user', 'extension']},
                                                          'permissions': {'allow': ['Skill']}})}},
}


def cases():
    for prompt in sorted(EVALS.glob('*/prompt.md')):
        _, front, body = prompt.read_text().split('---', 2)
        tags = [t.strip() for t in re.search(r'^tags:\s*\[(.*)\]', front, re.M)[1].split(',')]
        timeout = re.search(r'^timeout_seconds:\s*(\d+)', front, re.M)
        rubric = prompt.parent / 'graders' / 'advice.md'
        kind = 'quality' if 'quality' in tags else 'should-not-fire' if 'should-not-fire' in tags else 'should-fire'
        yield {'name': prompt.parent.name, 'kind': kind, 'prompt': body.strip(),
               'timeout': int(timeout[1]) if timeout else 600,
               'rubric': rubric.read_text().split('---', 2)[2].strip() if rubric.is_file() else None}


def events(text):
    for line in text.splitlines():
        line = line.strip()
        if line.startswith('{'):
            try:
                event = json.loads(line)
            except ValueError:
                continue
            if isinstance(event, dict):
                yield line, event


def loaded_in(line):
    if 'game-development' not in line or not LOADED.search(line):
        return False
    try:
        event = json.loads(line)
    except ValueError:
        return True
    return not (isinstance(event, dict) and event.get('type') in SETUP_EVENTS)


def outside(stdout):
    """Absolute paths the skill loaded from outside the scratch directories."""
    paths = {path for line in stdout.splitlines() if loaded_in(line) for path in SKILL_PATH.findall(line)}
    return sorted(p for p in paths if re.match(r'/|[A-Za-z]:', p) and 'gd-eval-' not in p)


def parse(stdout):
    """The final reply and any provider error in an agent's output."""
    result = message = error = None
    texts = []
    parsed = False
    for _, event in events(stdout):
        parsed = True
        kind = event.get('type')
        item = event.get('item') if isinstance(event.get('item'), dict) else {}
        part = event.get('part') if isinstance(event.get('part'), dict) else {}
        if kind == 'result':  # Claude Code, Qwen Code, Gemini CLI
            if isinstance(event.get('result'), str):
                result = event['result']
            if event.get('is_error'):
                error = str(event.get('result') or event.get('error'))[:300]
        elif kind == 'item.completed' and item.get('type') == 'agent_message':  # Codex
            message = item.get('text')
        elif kind == 'text' and part.get('text'):  # opencode
            texts.append(part['text'])
        elif kind == 'tool_use':
            texts = []
        elif kind in ('error', 'turn.failed'):
            error = json.dumps(event.get('error') or event.get('message') or event)[:300]
    reply = (result or message or '\n\n'.join(texts)) if parsed else stdout.strip()
    if reply.startswith('[API Error'):
        error = error or reply[:300]
    return reply, error


def execute(argv, cwd, env, timeout, stop_when_loaded):
    proc = subprocess.Popen(argv, cwd=cwd, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True, errors='replace', start_new_session=True)
    lines, errors, loaded = [], [], threading.Event()

    def pump():
        for line in proc.stdout:
            lines.append(line)
            if stop_when_loaded and loaded_in(line):
                loaded.set()

    readers = [threading.Thread(target=pump, daemon=True),
               threading.Thread(target=lambda: errors.append(proc.stderr.read()), daemon=True)]
    for reader in readers:
        reader.start()
    deadline, status = time.monotonic() + timeout, 'finished'
    while proc.poll() is None:
        if loaded.is_set():
            status = 'stopped after load'
            break
        if time.monotonic() > deadline:
            status = 'timeout'
            break
        time.sleep(0.5)
    if proc.poll() is None:
        for sig, wait in ((signal.SIGTERM, 10), (signal.SIGKILL, 5)):
            try:
                os.killpg(proc.pid, sig)
                proc.wait(wait)
                break
            except (ProcessLookupError, subprocess.TimeoutExpired):
                continue
    for reader in readers:
        reader.join(5)
    return ''.join(lines), ''.join(errors), proc.returncode, status


def judge(command, case, reply):
    prompt = JUDGE_PROMPT.format(request=case['prompt'], reply=reply, rubric=case['rubric'])
    try:
        out = subprocess.run(shlex.split(command), input=prompt, capture_output=True, text=True,
                             timeout=300, cwd=tempfile.gettempdir()).stdout
    except subprocess.TimeoutExpired:
        return None, 'judge timed out'
    for match in reversed(re.findall(r'\{[^{}]*"pass"[^{}]*\}', out)):
        try:
            verdict = json.loads(match)
            return bool(verdict['pass']), str(verdict.get('reason', ''))
        except (ValueError, KeyError):
            continue
    return None, 'no verdict: ' + out.strip()[:200]


def workspace(arm, profile, skills_dir, pointer=None):
    work = Path(tempfile.mkdtemp(prefix='gd-eval-'))
    if lib.ROOT in work.resolve().parents:
        raise SystemExit(f'scratch directory {work} is inside the repository; set TMPDIR elsewhere')
    subprocess.run(['git', 'init', '-q'], cwd=work, check=False)
    for rel, content in profile.get('files', {}).items():
        (work / rel).parent.mkdir(parents=True, exist_ok=True)
        (work / rel).write_text(content + '\n')
    if arm == 'with':
        shutil.copytree(lib.SKILL, work / ('docs' if pointer else skills_dir) / 'game-development',
                        ignore=shutil.ignore_patterns('__pycache__'))
        if pointer:
            (work / pointer).write_text(POINTER)
    return work


def run(args):
    profile = PROFILES.get(args.agent, {})
    extra = args.extra[1:] if args.extra[:1] == ['--'] else args.extra
    if args.cmd:
        template = shlex.split(args.cmd)
        name = args.name or Path(template[0]).name
    else:
        template = (profile['cmd'] + (['-m', '{model}'] if args.model else []) + extra + profile['prompt'])
        name = args.name or args.agent
    if args.pointer:
        name += '-pointer'
    entries, errors = lib.load(lib.REGISTRY)
    if errors:
        raise SystemExit('\n'.join(errors))
    cites, unlisted = (re.compile(pattern, re.I) for pattern in url_patterns(entries))
    wanted = {'trigger': ('should-fire', 'should-not-fire'), 'quality': ('quality',)}.get(
        args.suite, ('should-fire', 'should-not-fire', 'quality'))
    selected = [c for c in cases() if c['kind'] in wanted and (not args.case or any(t in c['name'] for t in args.case))]
    jobs = [(case, arm, i) for case in selected
            for arm in (('with', 'without') if case['kind'] == 'quality' else ('with',))
            for i in range(args.repeat)]
    stamp = datetime.datetime.now().strftime('%Y%m%dT%H%M%S')
    out = RESULTS / f'{stamp}-{name}'
    (out / 'logs').mkdir(parents=True)
    (out / 'meta.json').write_text(json.dumps({
        'agent': name, 'model': args.model, 'command': shlex.join(template),
        'skills_dir': None if args.pointer else args.skills_dir, 'pointer': args.pointer,
        'repeat': args.repeat, 'env_keys': [kv.split('=', 1)[0] for kv in args.env],
        'judge': None if args.no_judge else args.judge, 'started': stamp}, indent=1) + '\n')
    lock, done = threading.Lock(), [0]

    def one(job):
        case, arm, i = job
        work = workspace(arm, profile, args.skills_dir, args.pointer)
        home = tempfile.mkdtemp(prefix='gd-eval-home-')
        # Some agents take their directory from PWD rather than the process cwd.
        env = {**{k: v for k, v in os.environ.items() if k != 'OLDPWD'}, 'PWD': str(work),
               **(profile['env'](home) if 'env' in profile else {}), **dict(kv.split('=', 1) for kv in args.env)}
        argv = [part.replace('{prompt}', case['prompt']).replace('{model}', args.model or '')
                for part in template]
        started = time.monotonic()
        stdout, stderr, code, status = execute(argv, work, env, case['timeout'], case['kind'] == 'should-fire')
        seconds = round(time.monotonic() - started)
        shutil.rmtree(work, ignore_errors=True)
        shutil.rmtree(home, ignore_errors=True)
        reply, error = parse(stdout)
        if code not in (0, None) and status == 'finished' and not reply:
            error = error or f'exit {code}: ' + stderr.strip()[-300:]
        row = {'case': case['name'], 'kind': case['kind'], 'arm': arm, 'run': i,
               'loaded': any(loaded_in(line) for line in stdout.splitlines()),
               'outside': outside(stdout), 'status': status, 'seconds': seconds, 'error': error}
        if case['kind'] == 'quality':
            row['cites'] = bool(cites.search(reply))
            row['clean'] = not unlisted.search(reply)
            row['advice'], row['reason'] = (None, None) if args.no_judge or error else judge(args.judge, case, reply)
            row['reply'] = reply[:20000]
        (out / 'logs' / f'{case["name"]}.{arm}.{i}.log').write_text(
            stdout + '\n--- stderr (tail) ---\n' + stderr[-4000:])
        with lock:
            with open(out / 'results.jsonl', 'a') as handle:
                handle.write(json.dumps(row) + '\n')
            done[0] += 1
            marks = [f'loaded {"yes" if row["loaded"] else "no"}']
            if case['kind'] == 'quality':
                marks += [f'cites {"yes" if row["cites"] else "no"}', f'clean {"yes" if row["clean"] else "no"}',
                          f'advice {"-" if row["advice"] is None else "pass" if row["advice"] else "fail"}']
            print(f'[{done[0]}/{len(jobs)}] {case["name"]} {arm} #{i + 1}: ' + ', '.join(marks)
                  + f' ({seconds}s{", " + status if status != "finished" else ""})'
                  + (f' ERROR {error}' if error else '')
                  + (f' LEAK: loaded from {row["outside"][0]}' if row['outside'] else ''), flush=True)

    print(f'{len(jobs)} runs of {name}; results in {out}', flush=True)
    with ThreadPoolExecutor(args.jobs) as pool:
        list(pool.map(one, jobs))
    summarize([out / 'results.jsonl'])


def summarize(paths):
    paths = paths or sorted(RESULTS.glob('*/results.jsonl'))
    for path in map(Path, paths):
        meta = json.loads((path.parent / 'meta.json').read_text())
        rows = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
        tally, misses = defaultdict(lambda: [0, 0]), defaultdict(int)
        errors = sum(bool(r['error']) for r in rows)
        for r in rows:
            if r['error']:
                continue
            if r['kind'] == 'quality':
                for key in ('loaded', 'advice', 'cites', 'clean'):
                    if r.get(key) is not None:
                        tally[(r['arm'], key)][0] += bool(r[key])
                        tally[(r['arm'], key)][1] += 1
            else:
                tally[r['kind']][0] += r['loaded']
                tally[r['kind']][1] += 1
                if r['loaded'] != (r['kind'] == 'should-fire'):
                    misses[r['case']] += 1
        print(f'== {meta["agent"]}' + (f' ({meta["model"]})' if meta.get('model') else '')
              + (f', skill reached through {meta["pointer"]}' if meta.get('pointer') else '')
              + f', {meta["started"]}, {len(rows)} runs' + (f', {errors} errors (excluded)' if errors else ''))

        def cell(key):
            passed, total = tally[key]
            return f'{passed}/{total}' if total else '-'

        if tally['should-fire'][1] or tally['should-not-fire'][1]:
            print(f'  loaded the skill when it should     {cell("should-fire")}')
            print(f'  loaded it on near misses            {cell("should-not-fire")}')
        labels = (('loaded', 'loaded the skill'), ('advice', 'advice rubric passed'),
                  ('cites', 'links a registered source'), ('clean', 'no link outside the registry'))
        if any(tally[('with', key)][1] for key, _ in labels):
            print('  quality, with vs. without the skill:')
            for key, label in labels:
                print(f'    {label:32} {cell(("with", key))} vs. {cell(("without", key))}')
        if misses:
            print('  misses: ' + ', '.join(f'{k} x{v}' for k, v in sorted(misses.items())))
        leaks = sum(bool(r.get('outside')) for r in rows)
        if leaks:
            print(f'  WARNING: {leaks} runs loaded a copy of the skill outside their scratch directory, '
                  'so installed copies were not hidden and the results are not valid')


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='command', required=True)
    runner = sub.add_parser('run')
    target = runner.add_mutually_exclusive_group(required=True)
    target.add_argument('--agent', choices=sorted(PROFILES))
    target.add_argument('--cmd', help='command template containing {prompt} (and optionally {model})')
    runner.add_argument('--name', help='label for the results (default: agent or command name)')
    runner.add_argument('--model')
    runner.add_argument('--suite', choices=('trigger', 'quality', 'all'), default='all')
    runner.add_argument('--repeat', type=int, default=1)
    runner.add_argument('--case', action='append', default=[], help='run only cases whose name contains TEXT')
    runner.add_argument('--jobs', type=int, default=2)
    runner.add_argument('--env', action='append', default=[], metavar='KEY=VALUE')
    runner.add_argument('--skills-dir', default='.agents/skills')
    runner.add_argument('--pointer', metavar='FILE', help='put the skill in docs/ and point to it from FILE')
    runner.add_argument('--judge', default=JUDGE)
    runner.add_argument('--no-judge', action='store_true')
    runner.add_argument('extra', nargs=argparse.REMAINDER)
    summary = sub.add_parser('summarize')
    summary.add_argument('paths', nargs='*')
    args = parser.parse_args()
    if args.command == 'run':
        run(args)
    else:
        summarize(args.paths)
    return 0


if __name__ == '__main__':
    sys.exit(main())
