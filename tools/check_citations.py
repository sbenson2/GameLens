#!/usr/bin/env python3
"""Offline integrity check for the skill's registry and citations.

Checks: registry schema, unique ids and identifiers, every inline [@id] in
SKILL.md and references/*.md resolves, and each reference file ends with a
Sources section generated from its citations. --write regenerates those
sections. Exit status 1 on any error.
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sourcelib as lib  # noqa: E402


def documents(skill):
    yield skill / 'SKILL.md'
    yield from sorted((skill / 'references').glob('*.md'))


def check(registry, skill, write=False, extra=(), only=()):
    errors, warnings = [], []
    entries, load_errors = lib.load(registry) if Path(registry).is_file() else ([], [])
    errors += load_errors
    for path in extra:
        more, more_errors = lib.load(path)
        entries += more
        errors += more_errors
    by_id, seen_keys = {}, {}
    for entry in entries:
        where = f"{entry.get('id', '?')} (line {entry['_line']})"
        errors += [f'{where}: {p}' for p in lib.validate(entry)]
        ident = entry.get('id')
        if ident in by_id:
            errors.append(f'{where}: duplicate id')
        by_id[ident] = entry
        for key in ('doi', 'isbn', 'url'):
            value = entry.get(key)
            if not value:
                continue
            value = value.casefold()
            if (key, value) in seen_keys and seen_keys[(key, value)] != ident:
                errors.append(f'{where}: same {key} as {seen_keys[(key, value)]}')
            seen_keys[(key, value)] = ident
    for entry in entries:
        for field in ('summary', 'notes'):
            if lib.PRONOUN.search(entry.get(field) or ''):
                warnings.append(f"{entry.get('id')}: gendered pronoun in {field}; use a name or role unless it refers to a fictional character")
    cited = set()
    for path in documents(skill):
        if not path.is_file() or (only and path.name not in only):
            continue
        text = path.read_text(encoding='utf-8')
        body, footer = lib.body_and_footer(text)
        for number, line in enumerate(body.splitlines(), 1):
            if lib.PRONOUN.search(line):
                warnings.append(f'{path.name}:{number}: gendered pronoun; use a name or role unless it refers to a fictional character')
        ids = lib.citations(body)
        cited.update(ids)
        missing = [i for i in ids if i not in by_id]
        errors += [f'{path.name}: unknown citation [@{i}]' for i in missing]
        if path.name == 'SKILL.md':
            continue
        if footer is not None and footer.strip() != lib.SOURCES_HEADING and not ids:
            warnings.append(f'{path.name}: Sources section without inline citations')
        expected = lib.render_footer(ids, by_id) if ids else None
        if write and not missing:
            new = body if expected is None else body + '\n' + expected
            if new != text:
                path.write_text(new, encoding='utf-8')
        elif expected is not None and footer != expected:
            errors.append(f'{path.name}: Sources section is stale; run tools/check_citations.py --write')
    if not only:
        for ident in sorted(set(by_id) - cited):
            warnings.append(f'{ident}: registered but never cited')
    return errors, warnings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--registry', type=Path, default=lib.REGISTRY)
    parser.add_argument('--skill', type=Path, default=lib.SKILL)
    parser.add_argument('--extra', type=Path, action='append', default=[],
                        help='additional JSONL fragment to validate together with the registry')
    parser.add_argument('--fragments', type=Path, help='directory of draft JSONL registries to include')
    parser.add_argument('--only', action='append', default=[], help='limit document checks to this file name')
    parser.add_argument('--write', action='store_true', help='regenerate Sources sections')
    parser.add_argument('--quiet', action='store_true', help='omit warnings')
    args = parser.parse_args()
    extra = list(args.extra) + (sorted(args.fragments.glob('*.jsonl')) if args.fragments else [])
    errors, warnings = check(args.registry, args.skill, args.write, extra, set(args.only))
    for line in errors:
        print('ERROR', line)
    if not args.quiet:
        for line in warnings:
            print('WARN ', line)
    print(f'{len(errors)} errors, {len(warnings)} warnings')
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
