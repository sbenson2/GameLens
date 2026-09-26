#!/usr/bin/env python3
"""Build a claim-audit manifest: every source with every place it is cited.

For each registry entry, lists each reference-file line that cites it and
candidate local evidence files (transcripts matched by YouTube id or title,
plus files under --evidence-dir whose names contain the first author's
surname or the source's YouTube id). Splits the sources into --batches
groups of similar estimated effort and writes one JSON file per batch.

  audit_manifest.py --out build/audit --batches 10 [--evidence-dir DIR ...]
  audit_manifest.py --coverage --out build/audit   # which citation uses lack a verdict
"""
import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sourcelib as lib  # noqa: E402

TRANSCRIPTS = lib.ROOT / 'research' / 'transcripts' / 'gdc-youtube'
WEIGHT = {'transcript': 3, 'full-text': 3, 'excerpt': 2, 'abstract': 1}


def citation_uses():
    uses = {}
    for path in sorted(lib.REFERENCES.glob('*.md')):
        body, _ = lib.body_and_footer(path.read_text(encoding='utf-8'))
        for number, line in enumerate(body.splitlines(), 1):
            for ident in lib.citations(line):
                uses.setdefault(ident, []).append({'file': path.name, 'line': number, 'text': line.strip()})
    return uses


def transcript_titles():
    titles = {}
    if TRANSCRIPTS.is_dir():
        for path in TRANSCRIPTS.glob('*.md'):
            with path.open(encoding='utf-8', errors='replace') as stream:
                head = stream.read(600)
            match = re.search(r'^title:\s*"?(.*?)"?\s*$', head, re.M)
            if match:
                titles[path] = match[1]
    return titles


def candidates(entry, titles, evidence_files):
    found = []
    ids = set()
    for url in [entry['url']] + entry.get('alt_urls', []):
        match = re.search(r'(?:v=|youtu\.be/)([\w-]{11})', url)
        if match:
            ids.add(match[1])
    for vid in ids:
        path = TRANSCRIPTS / f'{vid}.md'
        if path.is_file():
            found.append(str(path))
    for path, title in titles.items():
        if str(path) not in found and lib.title_matches(entry['title'], title):
            found.append(str(path))
    surname = lib.surname(entry['authors'][0])
    year = str(entry['year'])
    for path in evidence_files:
        name = lib.fold(path.name)
        if any(vid.casefold() in path.name.casefold() for vid in ids) or (
                len(surname) > 3 and surname in name and (year in path.name or year[2:] in path.name)):
            found.append(str(path))
    return found[:12]


def build(out, batches, evidence_dirs):
    entries, errors = lib.load(lib.REGISTRY)
    if errors:
        raise SystemExit('\n'.join(errors))
    uses = citation_uses()
    titles = transcript_titles()
    evidence_files = [p for d in evidence_dirs for p in Path(d).rglob('*')
                      if p.is_file() and p.suffix.lower() in ('.txt', '.pdf', '.md', '.html', '.vtt', '.srt')]
    items = []
    for entry in entries:
        entry.pop('_line', None)
        item = {**entry, 'uses': uses.get(entry['id'], []),
                'evidence_candidates': candidates(entry, titles, evidence_files)}
        item['effort'] = WEIGHT.get(entry['checked']['content'], 2) * 2 + len(item['uses'])
        items.append(item)
    groups = [[] for _ in range(batches)]
    loads = [0] * batches
    for item in sorted(items, key=lambda i: -i['effort']):
        index = loads.index(min(loads))
        groups[index].append(item)
        loads[index] += item['effort']
    out.mkdir(parents=True, exist_ok=True)
    (out / 'findings').mkdir(exist_ok=True)
    for number, group in enumerate(groups, 1):
        group.sort(key=lambda i: i['id'])
        (out / f'batch-{number:02}.json').write_text(json.dumps(group, ensure_ascii=False, indent=1))
    total = sum(len(i['uses']) for i in items)
    print(f'{len(items)} sources, {total} citation uses, {batches} batches, '
          f'effort per batch {min(loads)}-{max(loads)}; '
          f'{sum(1 for i in items if i["evidence_candidates"])} sources with local evidence candidates')


def coverage(out):
    uses = citation_uses()
    expected = {(i, u['file'], u['line']) for i, us in uses.items() for u in us}
    seen, registry = set(), set()
    for path in sorted((out / 'findings').glob('*.jsonl')):
        for line in path.read_text(encoding='utf-8').splitlines():
            if not line.strip():
                continue
            row = json.loads(line)
            if row.get('registry'):
                registry.add(row['id'])
            else:
                seen.add((row['id'], row['file'], row['line']))
    missing = sorted(expected - seen)
    registered = {e['id'] for e in lib.load(lib.REGISTRY)[0]}
    print(f'{len(expected) - len(missing)}/{len(expected)} citation uses have a verdict; '
          f'{len(registry & registered)}/{len(registered)} registry entries reviewed')
    for ident, name, number in missing[:40]:
        print(f'  missing {ident} {name}:{number}')
    return 1 if missing or registered - registry else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--out', type=Path, default=lib.ROOT / 'build' / 'audit')
    parser.add_argument('--batches', type=int, default=10)
    parser.add_argument('--evidence-dir', action='append', default=[])
    parser.add_argument('--coverage', action='store_true')
    args = parser.parse_args()
    if args.coverage:
        return coverage(args.out)
    build(args.out, args.batches, args.evidence_dir)
    return 0


if __name__ == '__main__':
    sys.exit(main())
