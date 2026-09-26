#!/usr/bin/env python3
"""Read-only lexical search of the local research corpus (maintainers only).

Searches GDC talk transcripts (research/transcripts/gdc-youtube) and the GDC
Vault catalog (research/gdc/vault-catalog.jsonl). The corpus is local research
material and is never committed.
"""
import argparse
import html
import json
from pathlib import Path
import re
import sys


def terms(text):
    return set(re.findall(r'\w+', text.casefold()))


def scalar(value):
    value = value.strip()
    if value.startswith('"'):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            pass
    return value.strip("'\"")


def markdown(path, kind, full_text):
    # Header-only discovery avoids loading the large transcript archive by default.
    with path.open(encoding='utf-8', errors='replace') as stream:
        if full_text:
            text = stream.read()
        else:
            lines = []
            for index, line in enumerate(stream):
                lines.append(line)
                if index > 0 and line.strip() == '---':
                    break
                if index >= 39:
                    break
            text = ''.join(lines)
    title = path.stem
    url = None
    metadata = re.match(r'\A---\s*\n(.*?)\n---(?:\n|$)', text, re.S)
    if metadata:
        for line in metadata[1].splitlines():
            key, sep, value = line.partition(':')
            if sep and key.strip() == 'title':
                title = scalar(value)
            if sep and key.strip() == 'source':
                url = scalar(value)
    else:
        heading = re.search(r'^#\s+(.+)$', text, re.M)
        if heading:
            title = heading[1]
    result = {'kind': kind, 'title': str(title), 'path': str(path.resolve()), 'url': url}
    return result, text


def rank(record, body, query):
    title_terms = terms(record['title'])
    body_terms = terms(body)
    matched = query & (title_terms | body_terms)
    if not matched:
        return None
    # Coverage dominates repetition. A long transcript cannot win by repeating one word.
    score = len(matched) / len(query) * 100 + len(query & title_terms) * 10
    lines = body.splitlines()
    locator = max(range(len(lines)), key=lambda i: len(query & terms(lines[i]))) if lines else None
    snippet = lines[locator].strip() if locator is not None else ''
    if len(snippet) > 280:
        matches = list(re.finditer(r'\w+', snippet))
        hit = next((m.start() for m in matches if m[0].casefold() in query), 0)
        start = max(0, hit - 90)
        snippet = ('…' if start else '') + snippet[start:start+275] + '…'
    return {**record, 'score': round(score, 2), 'matched_terms': sorted(matched),
            'line': locator + 1 if locator is not None and record['kind'] != 'catalog' else None,
            'snippet': snippet}


def search(root, query, source, full_text, limit):
    results = []
    warnings = []
    available = []
    scanned = {'transcript': 0, 'catalog': 0}
    transcript_ids = set()
    locations = []
    if source in ('talks', 'all'):
        locations.append(('transcript', root / 'research/transcripts/gdc-youtube'))
    for kind, directory in locations:
        if not directory.is_dir():
            warnings.append(f'Missing {kind} directory: {directory}')
            continue
        available.append(str(directory))
        for path in sorted(directory.rglob('*.md')):
            try:
                record, body = markdown(path, kind, full_text)
            except OSError as exc:
                warnings.append(f'Cannot read {path}: {exc}')
                continue
            scanned[kind] += 1
            match = rank(record, body, query)
            if match:
                if kind == 'transcript':
                    transcript_ids.add(path.stem)
                results.append(match)
    if source in ('talks', 'all'):
        catalog = root / 'research/gdc/vault-catalog.jsonl'
        if catalog.is_file():
            available.append(str(catalog))
            bad_rows = 0
            try:
                with catalog.open(encoding='utf-8', errors='replace') as stream:
                    for line_number, line in enumerate(stream, 1):
                        try:
                            row = json.loads(line)
                            if not isinstance(row, dict) or not isinstance(row.get('title'), str) or not row['title'].strip():
                                raise ValueError('invalid catalog record')
                        except (ValueError, TypeError):
                            bad_rows += 1
                            continue
                        scanned['catalog'] += 1
                        if row.get('youtube_id') in transcript_ids:
                            continue
                        record = {'kind': 'catalog', 'title': html.unescape(row['title']),
                                  'url': row.get('url'), 'path': str(catalog.resolve()),
                                  'catalog_line': line_number}
                        body = record['title'] + '\n' + html.unescape(str(row.get('description') or ''))
                        match = rank(record, body, query)
                        if match:
                            results.append(match)
            except OSError as exc:
                warnings.append(f'Cannot read {catalog}: {exc}')
            if bad_rows:
                warnings.append(f'Skipped {bad_rows} malformed catalog records.')
        else:
            warnings.append(f'Missing catalog: {catalog}')
    if not available:
        raise ValueError(f'No selected knowledge sources under root: {root}')
    results.sort(key=lambda r: (-r['score'], r['title'].casefold(), r['path']))
    return {'mode': 'lexical; catalog text; transcript '+('full text' if full_text else 'headers'),
            'available_sources': available, 'scanned': scanned,
            'warnings': warnings, 'results': results[:limit]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--query', required=True, help='Concise words/concepts; not semantic search')
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--source', choices=('talks', 'all'), default='all')
    parser.add_argument('--full-text', action='store_true', help='Also scan downloaded transcript bodies')
    parser.add_argument('--limit', type=int, default=5)
    args = parser.parse_args()
    query = terms(args.query)
    if not query:
        parser.error('query must contain searchable words')
    if not 1 <= args.limit <= 20:
        parser.error('limit must be between 1 and 20')
    try:
        result = search(args.root.expanduser().resolve(), query, args.source, args.full_text, args.limit)
    except ValueError as exc:
        parser.error(str(exc))
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
