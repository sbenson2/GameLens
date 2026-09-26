#!/usr/bin/env python3
"""Verify that every registry entry exists as cited (network required).

peer-reviewed: DOI metadata from Crossref (title, first author, year, type);
               without a DOI, the URL must load and show the title.
gdc:           the GDC Vault page must show the session title and speaker;
               the year comes from the local Vault catalog or page thumbnail.
book:          ISBN metadata from Open Library, falling back to Google Books.
official-docs: the URL must load.

This checks existence and bibliographic accuracy only. Whether a summary
matches the source's content is recorded by the author in checked.content.
Results are cached per input file in tools/.verify-cache/ by entry fingerprint.
"""
import argparse
import hashlib
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sourcelib as lib  # noqa: E402

CACHE_DIR = Path(__file__).resolve().parent / '.verify-cache'
CATALOG = lib.ROOT / 'research' / 'gdc' / 'vault-catalog.jsonl'
AGENT = 'game-development-skill-source-verifier/1.0 (+https://github.com/sbenson2/GameLens)'
PEER_TYPES = {'journal-article', 'proceedings-article'}
_last_request = {}


def fetch(url, accept='*/*', attempts=3):
    host = url.split('/')[2]
    for attempt in range(attempts):
        wait = 0.4 - (time.time() - _last_request.get(host, 0))
        if wait > 0:
            time.sleep(wait)
        _last_request[host] = time.time()
        request = urllib.request.Request(url, headers={'User-Agent': AGENT, 'Accept': accept})
        try:
            with urllib.request.urlopen(request, timeout=25) as response:
                body = response.read(3_000_000)
                kind = response.headers.get('Content-Type', '')
                return response.status, kind, body.decode('utf-8', errors='replace')
        except urllib.error.HTTPError as exc:
            if exc.code in (429, 500, 502, 503, 504) and attempt + 1 < attempts:
                time.sleep(2 * (attempt + 1))
                continue
            return exc.code, '', ''
        except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
            if attempt + 1 < attempts:
                time.sleep(2 * (attempt + 1))
                continue
            return None, '', str(exc)
    return None, '', ''


def crossref_years(message):
    years = set()
    for key in ('published-print', 'published-online', 'issued', 'published'):
        parts = (message.get(key) or {}).get('date-parts') or []
        if parts and parts[0] and parts[0][0]:
            years.add(int(parts[0][0]))
    return years


def check_doi(entry):
    fails, warns = [], []
    status, _, body = fetch(f"https://api.crossref.org/works/{entry['doi']}", 'application/json')
    if status != 200:
        return [f'Crossref has no record for DOI {entry["doi"]} (HTTP {status})'], warns
    message = json.loads(body)['message']
    found = (message.get('title') or [''])[0]
    subtitle = (message.get('subtitle') or [''])[0]
    if not (lib.title_matches(entry['title'], found) or
            lib.title_matches(entry['title'], f'{found}: {subtitle}')):
        fails.append(f'title mismatch: Crossref has "{found}"')
    families = [lib.fold(a.get('family', '')) for a in message.get('author', [])]
    first = lib.surname(entry['authors'][0])
    if families and first not in families[0].split():
        (warns if any(first in f.split() for f in families) else fails).append(
            f'first author mismatch: Crossref lists {families[:3]}')
    years = crossref_years(message)
    if years and entry['year'] not in years:
        (warns if min(abs(entry['year'] - y) for y in years) <= 1 else fails).append(
            f'year {entry["year"]} not in Crossref dates {sorted(years)}')
    kind = message.get('type')
    container = ' '.join(message.get('container-title') or [])
    if entry['tier'] == 'peer-reviewed':
        if kind == 'posted-content':
            fails.append('Crossref type posted-content (preprint), not peer-reviewed')
        elif kind not in PEER_TYPES:
            warns.append(f'Crossref type {kind}; confirm peer review')
        if re.search(r'extended abstracts|companion|adjunct|poster', container, re.I):
            warns.append(f'venue "{container}" is an extended-abstract/companion track')
    return fails, warns


def vault_catalog():
    table = {}
    if CATALOG.is_file():
        for line in CATALOG.open(encoding='utf-8', errors='replace'):
            try:
                row = json.loads(line)
                table[str(row['id'])] = row
            except (ValueError, KeyError, TypeError):
                continue
    return table


def page_field(page, label):
    """Text of the <dd> that follows a Vault <dt> label; empty when the field is blank."""
    match = re.search(re.escape(label) + r'\s*</(?:h3|strong)>\s*</dt>\s*<dd[^>]*>(.*?)</dd>', page, re.S)
    if not match:
        return ''
    return ' '.join(lib.html_unescape(re.sub(r'<[^>]+>', ' ', match[1])).split())


def check_vault(entry, catalog):
    fails, warns = [], []
    vault_id = re.search(r'/play/(\d+)', entry['url'])[1]
    status, _, page = fetch(entry['url'], 'text/html')
    if status != 200:
        return [f'GDC Vault page returned HTTP {status}'], warns
    title = page_field(page, 'Session Name:')
    if not title:
        heading = re.search(r'<title>GDC Vault - ([^<]+)</title>', page)
        title = lib.html_unescape(heading[1]) if heading else ''
    speakers = page_field(page, 'Speaker(s):')
    if not title:
        fails.append('could not read the session title from the Vault page')
    elif not lib.title_matches(entry['title'], title):
        fails.append(f'title mismatch: Vault has "{title}"')
    if speakers:
        folded = lib.fold(speakers).split()
        if lib.surname(entry['authors'][0]) not in folded:
            fails.append(f'first speaker mismatch: Vault lists "{speakers}"')
    else:
        warns.append('Vault page lists no speakers')
    code = (catalog.get(vault_id) or {}).get('conference', '')
    if not code:
        thumb = re.search(r'thumb_([a-z_]*?)(\d{2})\.(?:jpg|png)', page)
        code = thumb[2] if thumb else ''
    digits = re.search(r'(\d{2})$', code)
    if digits:
        year = int(digits[1])
        year += 1900 if year > 90 else 2000
        if year != entry['year']:
            fails.append(f'year {entry["year"]} but Vault conference is {code or year}')
    else:
        warns.append('could not determine the conference year')
    return fails, warns


def isbn_metadata(isbn):
    status, _, body = fetch(f'https://openlibrary.org/isbn/{isbn}.json', 'application/json')
    if status == 200:
        data = json.loads(body)
        title = data.get('title', '')
        if data.get('subtitle'):
            title += ': ' + data['subtitle']
        names = []
        keys = [a['key'] for a in data.get('authors', []) if 'key' in a]
        if not keys and data.get('works'):
            s, _, work = fetch(f"https://openlibrary.org{data['works'][0]['key']}.json", 'application/json')
            if s == 200:
                keys = [a['author']['key'] for a in json.loads(work).get('authors', []) if 'author' in a]
        for key in keys[:3]:
            s, _, author = fetch(f'https://openlibrary.org{key}.json', 'application/json')
            if s == 200:
                names.append(json.loads(author).get('name', ''))
        year = re.search(r'(\d{4})', data.get('publish_date', ''))
        return 'Open Library', title, names, int(year[1]) if year else None
    status, _, body = fetch(f'https://www.googleapis.com/books/v1/volumes?q=isbn:{isbn}', 'application/json')
    if status == 200:
        items = json.loads(body).get('items') or []
        if items:
            info = items[0]['volumeInfo']
            title = info.get('title', '') + (': ' + info['subtitle'] if info.get('subtitle') else '')
            year = re.search(r'(\d{4})', info.get('publishedDate', ''))
            return 'Google Books', title, info.get('authors', []), int(year[1]) if year else None
    return None, '', [], None


def check_isbn(entry):
    fails, warns = [], []
    service, title, names, year = isbn_metadata(entry['isbn'])
    if not service:
        return [f'ISBN {entry["isbn"]} not found in Open Library or Google Books'], warns
    if not lib.title_matches(entry['title'], title):
        fails.append(f'title mismatch: {service} has "{title}"')
    if names:
        first = lib.surname(entry['authors'][0])
        if not any(first in lib.fold(n).split() for n in names):
            fails.append(f'author mismatch: {service} lists {names}')
    else:
        warns.append(f'{service} lists no authors')
    if year and year != entry['year']:
        warns.append(f'year {entry["year"]} but {service} edition date is {year}')
    return fails, warns


def check_url(entry, require_title):
    status, kind, page = fetch(entry['url'], 'text/html,application/pdf')
    if status != 200:
        return [f'URL returned HTTP {status}'], []
    if require_title and 'pdf' in kind:
        return [], ['PDF: title not machine-checked; confirm manually']
    if require_title and lib.fold(entry['title'])[:60] not in lib.fold(page):
        return [], ['title text not found on page; confirm manually']
    return [], []


def verify(entry, catalog):
    tier = entry['tier']
    if tier == 'gdc':
        return check_vault(entry, catalog)
    if tier == 'book':
        return check_isbn(entry)
    if tier == 'peer-reviewed':
        return check_doi(entry) if entry.get('doi') else check_url(entry, True)
    return check_url(entry, False)


def fingerprint(entry):
    fields = {k: entry.get(k) for k in ('tier', 'title', 'authors', 'year', 'url', 'doi', 'isbn')}
    return hashlib.sha256(json.dumps(fields, sort_keys=True).encode()).hexdigest()[:16]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('files', nargs='*', type=Path, help='JSONL files (default: the registry)')
    parser.add_argument('--ids', help='comma-separated ids to verify')
    parser.add_argument('--refresh', action='store_true', help='ignore cached results')
    parser.add_argument('--json', action='store_true', help='print machine-readable results')
    args = parser.parse_args()
    entries, errors = [], []
    for path in args.files or [lib.REGISTRY]:
        more, more_errors = lib.load(path)
        entries += more
        errors += more_errors
    wanted = set(args.ids.split(',')) if args.ids else None
    cache_file = CACHE_DIR / f'{(args.files or [lib.REGISTRY])[0].stem}.json'
    CACHE_DIR.mkdir(exist_ok=True)
    cache = json.loads(cache_file.read_text()) if cache_file.is_file() and not args.refresh else {}
    catalog = vault_catalog()
    results, failed = [], 0
    for entry in entries:
        if wanted and entry.get('id') not in wanted:
            continue
        problems = lib.validate(entry)
        if problems:
            result = {'id': entry.get('id'), 'status': 'FAIL', 'fails': problems, 'warns': []}
        else:
            key = fingerprint(entry)
            cached = cache.get(entry['id'])
            if cached and cached.get('fingerprint') == key and cached['status'] != 'FAIL':
                result = cached
            else:
                fails, warns = verify(entry, catalog)
                result = {'id': entry['id'], 'fingerprint': key, 'status':
                          'FAIL' if fails else 'WARN' if warns else 'OK',
                          'fails': fails, 'warns': warns, 'date': time.strftime('%Y-%m-%d')}
                cache[entry['id']] = result
                temp = cache_file.with_suffix('.tmp')
                temp.write_text(json.dumps(cache, indent=1, sort_keys=True))
                temp.replace(cache_file)
        failed += result['status'] == 'FAIL'
        results.append(result)
        if not args.json:
            notes = '; '.join(result['fails'] + result['warns'])
            print(f"{result['status']:4} {result['id']}" + (f' — {notes}' if notes else ''), flush=True)
    if args.json:
        print(json.dumps(results, indent=1))
    for line in errors:
        print('ERROR', line)
    print(f'{len(results)} checked, {failed} failed')
    return 1 if failed or errors else 0


if __name__ == '__main__':
    sys.exit(main())
