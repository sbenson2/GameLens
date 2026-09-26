#!/usr/bin/env python3
"""Apply claim-audit findings to the reference files and the registry.

Reads build/audit/findings/*.jsonl. For each use whose verdict is not
`supported`, replaces the exact `quote` with `fix` on the recorded line.
Several findings on one line are applied right to left so earlier offsets
stay valid; a quote that is missing or overlaps another finding goes to
build/audit/manual.jsonl for hand resolution. Registry records update the
summary and checked.content and append notes. Use --dry-run to report only.
"""
import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sourcelib as lib  # noqa: E402


def load_findings(directory):
    uses, registry = [], []
    for path in sorted(directory.glob('*.jsonl')):
        for number, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
            if not line.strip():
                continue
            row = json.loads(line)
            row['_from'] = f'{path.name}:{number}'
            (registry if row.get('registry') else uses).append(row)
    return uses, registry


def tidy(text):
    """Collapse spaces left by a removal, keeping the line's indentation."""
    indent = text[:len(text) - len(text.lstrip())]
    rest = re.sub(r'[ \t]{2,}', ' ', text.lstrip())
    rest = re.sub(r' +([.,;:])', r'\1', rest)
    return indent + rest.rstrip()


def apply_uses(uses, dry_run):
    manual, applied = [], 0
    by_line = {}
    for row in uses:
        if row.get('verdict') == 'supported':
            continue
        if 'quote' not in row or 'fix' not in row:
            manual.append({**row, 'reason': 'missing quote or fix'})
            continue
        by_line.setdefault((row['file'], row['line']), []).append(row)
    for name in sorted({f for f, _ in by_line}):
        path = lib.REFERENCES / name
        text = path.read_text(encoding='utf-8')
        body, footer = lib.body_and_footer(text)
        lines = body.split('\n')
        for (file, number), rows in sorted(by_line.items()):
            if file != name:
                continue
            original = lines[number - 1]
            spans = []
            for row in rows:
                start = original.find(row['quote']) if row['quote'] else -1
                if start == -1:
                    manual.append({**row, 'reason': 'quote not found on line'})
                    continue
                end = start + len(row['quote'])
                if any(start < e and s < end for s, e, _ in spans):
                    same = [r for s, e, r in spans if s == start and e == end and r['fix'] == row['fix']]
                    if not same:
                        manual.append({**row, 'reason': 'overlaps another finding on this line'})
                    continue
                spans.append((start, end, row))
            new = original
            for start, end, row in sorted(spans, key=lambda s: -s[0]):
                new = new[:start] + row['fix'] + new[end:]
                applied += 1
            lines[number - 1] = tidy(new) if new != original else original
        if not dry_run:
            new_body = '\n'.join(lines)
            path.write_text(new_body + ('\n' + footer if footer else ''), encoding='utf-8')
    return applied, manual


def apply_registry(records, dry_run):
    entries = [json.loads(l) for l in lib.REGISTRY.read_text(encoding='utf-8').splitlines() if l.strip()]
    by_id = {e['id']: e for e in entries}
    changed, problems = 0, []
    for row in records:
        if row.get('verdict') != 'fix':
            continue
        entry = by_id.get(row['id'])
        if not entry:
            problems.append({**row, 'reason': 'unknown id'})
            continue
        if row.get('summary'):
            entry['summary'] = row['summary']
        if row.get('checked_content'):
            entry['checked']['content'] = row['checked_content']
        for field in ('title', 'authors', 'year', 'venue', 'url'):
            if row.get(field):
                entry[field] = row[field]
        if row.get('notes_append'):
            entry['notes'] = (entry.get('notes', '') + ' ' + row['notes_append']).strip()
            if re.search(r'\b(title|author|year|venue|speaker)s?\b', row['notes_append'], re.I):
                problems.append({**row, 'reason': 'notes mention bibliographic details; check by hand'})
        changed += 1
        problems += [{**row, 'reason': p} for p in lib.validate(entry)]
    if not dry_run:
        lib.REGISTRY.write_text(''.join(json.dumps(e, ensure_ascii=False) + '\n' for e in entries), encoding='utf-8')
    return changed, problems


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--audit', type=Path, default=lib.ROOT / 'build' / 'audit')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    uses, registry = load_findings(args.audit / 'findings')
    verdicts = {}
    for row in uses:
        verdicts[row.get('verdict')] = verdicts.get(row.get('verdict'), 0) + 1
    print('use verdicts:', dict(sorted(verdicts.items(), key=lambda p: -p[1])))
    applied, manual = apply_uses(uses, args.dry_run)
    changed, problems = apply_registry(registry, args.dry_run)
    manual += problems
    (args.audit / 'manual.jsonl').write_text(''.join(json.dumps(m, ensure_ascii=False) + '\n' for m in manual))
    print(f'applied {applied} text fixes, {changed} registry fixes; {len(manual)} need manual resolution '
          f'({args.audit / "manual.jsonl"})' + (' [dry run]' if args.dry_run else ''))
    return 0


if __name__ == '__main__':
    sys.exit(main())
