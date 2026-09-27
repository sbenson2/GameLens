#!/usr/bin/env python3
"""Write the registry-derived URL graders into every quality eval case.

Two `regex` graders, rebuilt from references/sources.jsonl so they track the
registry:

  cites-registry-source.md  passes when the final reply links at least one
                            registered source (url, DOI, or alternate URL)
  no-unlisted-urls.md       passes when the final reply contains no URL
                            outside the registry, i.e. nothing recalled from
                            memory or constructed

Cases are the directories under evals/ whose prompt.md lists the `quality`
tag. Patterns are JavaScript-compatible. Re-run after changing the registry.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sourcelib as lib  # noqa: E402

EVALS = lib.ROOT / 'evals'
END = r"""(?=$|[\s)\]>"'`,;!?]|\.(?:\s|$))"""


def js_escape(text):
    return re.sub(r'([.^$*+?()\[\]{}|\\/])', r'\\\1', text)


def url_pattern(url):
    """Pattern for one URL, written without its scheme."""
    rest = re.sub(r'^https?://', '', url).rstrip('/')
    vault = re.match(r'(?:www\.)?gdcvault\.com/play/(\d+)', rest)
    if vault:
        return r'(?:www\.)?gdcvault\.com\/play\/' + vault[1] + r'(?!\d)'
    doi = re.match(r'(?:dx\.)?doi\.org/(.+)', rest)
    if doi:
        return r'(?:dx\.)?doi\.org\/' + js_escape(doi[1]) + r'(?![0-9A-Za-z])'
    video = re.match(r'(?:www\.)?youtube\.com/watch\?v=([\w-]{11})', rest)
    if video:
        return r'(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)' + video[1] + r'(?![\w-])'
    host_path = re.sub(r'^www\.', '', rest)
    return r'(?:www\.)?' + js_escape(host_path) + r'\/?(?:#[\w.-]*)?' + END


def alternation(entries):
    patterns = []
    for entry in entries:
        urls = [entry['url']] + entry.get('alt_urls', [])
        if entry.get('doi'):
            urls.append('https://doi.org/' + entry['doi'])
        for url in urls:
            pattern = url_pattern(url)
            if pattern not in patterns:
                patterns.append(pattern)
    return '|'.join(patterns)


def url_patterns(entries):
    """The `cites` and `unlisted` patterns; valid in both JavaScript and Python."""
    allowed = alternation(entries)
    cites = r'https?:\/\/(?:' + allowed + ')'
    unlisted = r'https?:\/\/(?!(?:' + allowed + r'))[^\s)\]>"' + "'" + r'`]+'
    return cites, unlisted


def grader(name, pattern, match=None):
    lines = ['---', 'type: regex', 'target: last_message', 'flags: i']
    if match:
        lines.append(f'match: {match}')
    lines.append("pattern: '" + pattern.replace("'", "''") + "'")
    lines.append('---')
    lines.append('')
    return '\n'.join(lines)


def main():
    entries, errors = lib.load(lib.REGISTRY)
    if errors:
        raise SystemExit('\n'.join(errors))
    cites, unlisted = url_patterns(entries)
    written = 0
    for prompt in sorted(EVALS.glob('*/prompt.md')):
        front = prompt.read_text().split('---')[1] if prompt.read_text().startswith('---') else ''
        if not re.search(r'^tags:.*\bquality\b', front, re.M):
            continue
        graders = prompt.parent / 'graders'
        graders.mkdir(exist_ok=True)
        (graders / 'cites-registry-source.md').write_text(grader('cites', cites))
        (graders / 'no-unlisted-urls.md').write_text(grader('unlisted', unlisted, 'not_contains'))
        written += 1
    print(f"{alternation(entries).count(chr(124)) + 1} alternatives; graders written to {written} quality cases")
    return 0


if __name__ == '__main__':
    sys.exit(main())
