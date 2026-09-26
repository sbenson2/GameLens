"""Shared registry loading, schema validation, and citation parsing.

The registry is skills/game-development/references/sources.jsonl: one JSON
object per line. Reference files cite entries inline as [@id] or
[@id-one; @id-two]. Python standard library only.
"""
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / 'skills' / 'game-development'
REFERENCES = SKILL / 'references'
REGISTRY = REFERENCES / 'sources.jsonl'

TIERS = ('peer-reviewed', 'gdc', 'book', 'official-docs')
EVIDENCE = ('empirical', 'practitioner', 'theory', 'technical')
METADATA_CHECKS = ('crossref', 'vault', 'openlibrary', 'publisher', 'manual')
CONTENT_CHECKS = ('full-text', 'transcript', 'abstract', 'excerpt')
ACCESS = ('free', 'paywalled', 'members', 'purchase')

TOPICS = frozenset('''
    design decisions motivation fun flow emergence uncertainty narrative dialogue worldbuilding
    balance economy progression randomness monetization ethics competitive social multiplayer
    game-feel controls latency camera animation juice feedback
    levels onboarding tutorials difficulty puzzles pacing
    accessibility ai pcg systems saves inventory combat
    architecture patterns ecs simulation networking performance tools engines
    art ui audio music readability
    playtesting user-research analytics metrics
    production scope prototyping postmortem teams live-ops
    genre-platformer genre-action genre-shooter genre-fighting genre-card genre-roguelike
    genre-strategy genre-puzzle genre-rpg genre-open-world genre-horror genre-simulation
    genre-mobile genre-vr genre-narrative genre-sports genre-racing
'''.split())

ID_PATTERN = re.compile(r'^[a-z][a-z0-9]*\d{4}(-[a-z0-9]+)+$')
DOI_PATTERN = re.compile(r'^10\.\d{4,9}/\S+$')
CITATION = re.compile(r'\[(@[a-z0-9-]+(?:\s*;\s*@[a-z0-9-]+)*)\]')
SOURCES_HEADING = '## Sources'
PRONOUN = re.compile(r'\b(he|she|his|her|hers|him|himself|herself)\b', re.I)


def load(path=REGISTRY):
    """Return (entries, errors). Errors name the file and line."""
    entries, errors = [], []
    with Path(path).open(encoding='utf-8') as stream:
        for number, line in enumerate(stream, 1):
            if not line.strip():
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError as exc:
                errors.append(f'{path}:{number}: invalid JSON: {exc}')
                continue
            if not isinstance(entry, dict):
                errors.append(f'{path}:{number}: entry is not an object')
                continue
            entry['_line'] = number
            entries.append(entry)
    return entries, errors


def validate(entry):
    """Return a list of schema problems for one registry entry."""
    problems = []

    def need(key, kind):
        value = entry.get(key)
        if not isinstance(value, kind) or (isinstance(value, (str, list)) and not value):
            problems.append(f'{key} must be a non-empty {kind.__name__}')
            return None
        return value

    ident = need('id', str)
    if ident and not ID_PATTERN.match(ident):
        problems.append('id must look like author2004-slug (lowercase ascii)')
    tier = need('tier', str)
    if tier and tier not in TIERS:
        problems.append(f'tier must be one of {TIERS}')
    need('title', str)
    authors = need('authors', list)
    if authors and not all(isinstance(a, str) and a.strip() for a in authors):
        problems.append('authors must be non-empty strings')
    year = entry.get('year')
    if not isinstance(year, int) or not 1950 <= year <= 2100:
        problems.append('year must be an integer')
    need('venue', str)
    url = need('url', str)
    if url and not url.startswith('https://'):
        problems.append('url must be https')
    topics = need('topics', list)
    if topics:
        unknown = sorted(set(topics) - TOPICS)
        if unknown:
            problems.append(f'unknown topics: {unknown}')
    summary = need('summary', str)
    if summary and len(summary) > 700:
        problems.append('summary must be at most 700 characters')
    evidence = need('evidence', str)
    if evidence and evidence not in EVIDENCE:
        problems.append(f'evidence must be one of {EVIDENCE}')
    access = entry.get('access')
    if access is not None and access not in ACCESS:
        problems.append(f'access must be one of {ACCESS}')
    checked = entry.get('checked')
    if not isinstance(checked, dict):
        problems.append('checked must be an object with date, metadata, content')
    else:
        if not re.match(r'^\d{4}-\d{2}-\d{2}$', str(checked.get('date', ''))):
            problems.append('checked.date must be YYYY-MM-DD')
        if checked.get('metadata') not in METADATA_CHECKS:
            problems.append(f'checked.metadata must be one of {METADATA_CHECKS}')
        if checked.get('content') not in CONTENT_CHECKS:
            problems.append(f'checked.content must be one of {CONTENT_CHECKS}')
    doi = entry.get('doi')
    if doi is not None and not (isinstance(doi, str) and DOI_PATTERN.match(doi)):
        problems.append('doi must be a bare DOI such as 10.1145/123')
    isbn = entry.get('isbn')
    if isbn is not None and not (isinstance(isbn, str) and re.fullmatch(r'97[89]\d{10}', isbn)):
        problems.append('isbn must be ISBN-13 digits without hyphens')
    if tier == 'gdc' and url and not re.match(r'^https://(www\.)?gdcvault\.com/play/\d+', url):
        problems.append('gdc entries must use a gdcvault.com/play URL')
    if tier == 'book' and not isbn:
        problems.append('book entries need an isbn')
    if tier == 'peer-reviewed' and not doi and not entry.get('notes'):
        problems.append('peer-reviewed entries without a DOI need notes explaining the venue and review')
    alt = entry.get('alt_urls')
    if alt is not None and not (isinstance(alt, list) and all(isinstance(u, str) and u.startswith('https://') for u in alt)):
        problems.append('alt_urls must be a list of https URLs')
    return problems


def citations(text):
    """Return cited ids in order of first appearance."""
    seen = []
    for match in CITATION.finditer(text):
        for part in match[1].split(';'):
            ident = part.strip().lstrip('@')
            if ident not in seen:
                seen.append(ident)
    return seen


def body_and_footer(text):
    """Split a reference file at its generated Sources section."""
    marker = '\n' + SOURCES_HEADING + '\n'
    index = text.rfind(marker)
    if index == -1:
        return text.rstrip('\n') + '\n', None
    return text[:index].rstrip('\n') + '\n', text[index + 1:]


def format_authors(authors):
    if len(authors) == 1:
        return authors[0]
    if len(authors) == 2:
        return f'{authors[0]} and {authors[1]}'
    return f'{authors[0]} et al.'


TIER_LABEL = {'peer-reviewed': 'peer-reviewed', 'gdc': 'GDC talk', 'book': 'book',
              'official-docs': 'official documentation'}


def reference_line(entry):
    """One human-readable citation line for a Sources section."""
    link = f"https://doi.org/{entry['doi']}" if entry.get('doi') else entry['url']
    title = entry['title'].rstrip('.')
    return (f"- `{entry['id']}` {format_authors(entry['authors'])} ({entry['year']}). "
            f"{title}. {entry['venue']}. {link} ({TIER_LABEL[entry['tier']]})")


def render_footer(ids, by_id):
    lines = [SOURCES_HEADING, '']
    lines += [reference_line(by_id[i]) for i in ids if i in by_id]
    return '\n'.join(lines) + '\n'


TRANSLITERATE = str.maketrans({'ð': 'd', 'þ': 'th', 'ø': 'o', 'æ': 'ae', 'œ': 'oe', 'ß': 'ss',
                               'ł': 'l', 'đ': 'd', 'ı': 'i', 'ħ': 'h'})


def fold(text):
    """Casefold, strip accents and punctuation for fuzzy comparisons."""
    text = unicodedata.normalize('NFKD', html_unescape(text).casefold().translate(TRANSLITERATE))
    text = ''.join(c for c in text if not unicodedata.combining(c))
    text = re.sub(r'<[^>]+>', ' ', text)
    return ' '.join(re.findall(r'[^\W_]+', text))


def html_unescape(text):
    import html
    return html.unescape(text or '')


def similarity(a, b):
    """Token-set similarity used to compare cited and registered titles."""
    left, right = set(fold(a).split()), set(fold(b).split())
    if not left or not right:
        return 0.0
    return len(left & right) / max(len(left), len(right))


def title_matches(cited, found):
    """True when titles agree, allowing a missing or extra subtitle."""
    if similarity(cited, found) >= 0.85:
        return True
    main = lambda t: re.split(r'[:—–]| - ', t, maxsplit=1)[0]
    return similarity(main(cited), main(found)) >= 0.9 and len(fold(main(cited)).split()) >= 2


def surname(name):
    """Last token of a personal name, folded."""
    tokens = fold(name).split()
    return tokens[-1] if tokens else ''
