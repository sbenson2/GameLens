#!/usr/bin/env python3
"""Search the skill's verified source registry (offline, standard library only).

  sources.py find <words> [--topic T] [--tier T] [--limit N]
  sources.py show <id> [<id> ...]
  sources.py topics

Ranking is word overlap across title, summary, topics, authors and venue.
It finds registered sources; it does not search the web or rate evidence.
"""
import argparse
import json
import re
import sys
from pathlib import Path

REGISTRY = Path(__file__).resolve().parents[1] / 'references' / 'sources.jsonl'


def load():
    with REGISTRY.open(encoding='utf-8') as stream:
        return [json.loads(line) for line in stream if line.strip()]


def words(text):
    return set(re.findall(r'[a-z0-9]+', text.casefold()))


def stem(word):
    for suffix in ('ings', 'ing', 'ies', 'es', 's', 'ed'):
        if word.endswith(suffix) and len(word) - len(suffix) >= 3:
            return word[:-len(suffix)]
    return word


def find(entries, query, topic, tier, limit):
    wanted = {stem(w) for w in words(query)}
    results = []
    for entry in entries:
        if topic and topic not in entry['topics']:
            continue
        if tier and entry['tier'] != tier:
            continue
        title = {stem(w) for w in words(entry['title'])}
        rest = {stem(w) for w in words(' '.join([entry['summary'], ' '.join(entry['topics']),
                                                ' '.join(entry['authors']), entry['venue']]))}
        hits = wanted & (title | rest)
        if wanted and not hits:
            continue
        score = len(hits) * 10 + len(wanted & title) * 5
        results.append((score, entry))
    results.sort(key=lambda pair: (-pair[0], -pair[1]['year']))
    return [entry for _, entry in results[:limit]]


def line(entry):
    authors = entry['authors'][0] + (' et al.' if len(entry['authors']) > 2 else
                                     f" and {entry['authors'][1]}" if len(entry['authors']) == 2 else '')
    return (f"{entry['id']}  [{entry['tier']}, {entry['evidence']}]  {authors} ({entry['year']}). "
            f"{entry['title']}. {entry['venue']}.\n    {entry['summary']}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='command', required=True)
    finder = sub.add_parser('find')
    finder.add_argument('words', nargs='*')
    finder.add_argument('--topic')
    finder.add_argument('--tier', choices=('peer-reviewed', 'gdc', 'book', 'official-docs'))
    finder.add_argument('--limit', type=int, default=8)
    shower = sub.add_parser('show')
    shower.add_argument('ids', nargs='+')
    sub.add_parser('topics')
    args = parser.parse_args()
    entries = load()
    if args.command == 'find':
        if not args.words and not args.topic and not args.tier:
            parser.error('give search words, --topic, or --tier')
        found = find(entries, ' '.join(args.words), args.topic, args.tier, max(1, min(args.limit, 50)))
        print('\n'.join(line(e) for e in found) if found else 'No registered source matches; see references/sources.md for searching beyond the registry.')
    elif args.command == 'show':
        by_id = {e['id']: e for e in entries}
        missing = [i for i in args.ids if i not in by_id]
        print(json.dumps([by_id[i] for i in args.ids if i in by_id], ensure_ascii=False, indent=1))
        if missing:
            print(f'Unknown ids: {", ".join(missing)}', file=sys.stderr)
            return 1
    else:
        counts = {}
        for entry in entries:
            for topic in entry['topics']:
                counts[topic] = counts.get(topic, 0) + 1
        for topic, count in sorted(counts.items(), key=lambda p: (-p[1], p[0])):
            print(f'{count:4}  {topic}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
