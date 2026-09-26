#!/usr/bin/env python3
"""Merge draft registries (build/fragments/*.jsonl) into the skill registry.

Entries are keyed by id; the same DOI, ISBN or URL under two ids is reported
as a conflict for a human to resolve. When two fragments register the same
id, the entry with the deeper content check wins (full-text > transcript >
excerpt > abstract) and field differences are reported. The output is sorted
by id for stable diffs. Use --dry-run to report without writing.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sourcelib as lib  # noqa: E402

DEPTH = {'full-text': 3, 'transcript': 2, 'excerpt': 1, 'abstract': 0}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fragments', type=Path, default=lib.ROOT / 'build' / 'fragments')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    merged, origin, notes = {}, {}, []
    sources = ([lib.REGISTRY] if lib.REGISTRY.is_file() else []) + sorted(args.fragments.glob('*.jsonl'))
    for path in sources:
        entries, errors = lib.load(path)
        notes += errors
        for entry in entries:
            entry.pop('_line', None)
            ident = entry.get('id')
            if ident in merged:
                old = merged[ident]
                diffs = sorted(k for k in set(old) | set(entry) if k not in ('summary', 'checked', 'topics')
                               and old.get(k) != entry.get(k))
                if diffs:
                    notes.append(f'{ident}: {origin[ident]} and {path.name} differ in {diffs}')
                if DEPTH.get(entry.get('checked', {}).get('content'), -1) > DEPTH.get(old.get('checked', {}).get('content'), -1):
                    entry['topics'] = sorted(set(entry.get('topics', [])) | set(old.get('topics', [])))
                    merged[ident], origin[ident] = entry, path.name
                else:
                    old['topics'] = sorted(set(old.get('topics', [])) | set(entry.get('topics', [])))
                continue
            merged[ident], origin[ident] = entry, path.name
    keys = {}
    for ident, entry in merged.items():
        for field in ('doi', 'isbn', 'url'):
            value = (entry.get(field) or '').casefold()
            if value and (field, value) in keys:
                notes.append(f'conflict: {ident} and {keys[(field, value)]} share {field} {value}')
            keys[(field, value)] = ident
    for line in notes:
        print(line)
    print(f'{len(merged)} entries from {len(sources)} files')
    if not args.dry_run:
        lines = [json.dumps(merged[i], ensure_ascii=False) for i in sorted(merged)]
        lib.REGISTRY.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    return 1 if any(n.startswith('conflict') for n in notes) else 0


if __name__ == '__main__':
    sys.exit(main())
