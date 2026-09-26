#!/usr/bin/env python3
"""Fetch captions for one GDC talk from the official GDC YouTube channel.

  talk_transcript.py "<talk title>" [--speaker NAME]   search, then fetch the best match
  talk_transcript.py --id <youtube id>                  fetch a known video

Only videos uploaded by the official GDC channel are accepted. Captions are
saved to research/transcripts/gdc-youtube/<id>.md (local research only; never
commit or redistribute) and the path is printed as JSON. Requires yt-dlp.
"""
import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / 'gdc-corpus'))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from convert import parse_vtt  # noqa: E402
import sourcelib as lib  # noqa: E402

GDC_CHANNEL = 'UC0JB7TSe49lg56u6qH8y_MQ'
DEST = lib.ROOT / 'research' / 'transcripts' / 'gdc-youtube'


def search(title, speaker, count=8):
    query = f'ytsearch{count}:GDC {title} {speaker or ""}'.strip()
    out = subprocess.run(['yt-dlp', '--flat-playlist', '--dump-json', query],
                         capture_output=True, text=True, timeout=120)
    candidates = []
    for line in out.stdout.splitlines():
        item = json.loads(line)
        if item.get('channel_id') != GDC_CHANNEL:
            continue
        score = lib.similarity(title, item.get('title', ''))
        candidates.append({'id': item['id'], 'title': item.get('title'), 'score': round(score, 2),
                           'duration': item.get('duration')})
    return sorted(candidates, key=lambda c: -c['score'])


def fetch(video):
    path = DEST / f'{video}.md'
    if path.is_file():
        return {'id': video, 'transcript': str(path), 'cached': True}
    with tempfile.TemporaryDirectory() as temp:
        meta = subprocess.run(['yt-dlp', '--skip-download', '--dump-json', f'https://www.youtube.com/watch?v={video}'],
                              capture_output=True, text=True, timeout=120)
        if meta.returncode != 0:
            return {'id': video, 'error': meta.stderr.strip()[-300:]}
        info = json.loads(meta.stdout)
        if info.get('channel_id') != GDC_CHANNEL:
            return {'id': video, 'error': f"not an official GDC upload (channel {info.get('channel')})"}
        subprocess.run(['yt-dlp', '--skip-download', '--write-subs', '--write-auto-subs', '--sub-langs', 'en,en-orig',
                        '--sub-format', 'vtt', '-o', f'{temp}/%(id)s.%(ext)s',
                        f'https://www.youtube.com/watch?v={video}'], capture_output=True, text=True, timeout=180)
        files = sorted(Path(temp).glob('*.vtt'), key=lambda p: (p.name.count('orig'), p.name))
        if not files:
            return {'id': video, 'error': 'no English captions available'}
        body = parse_vtt(files[0])
        DEST.mkdir(parents=True, exist_ok=True)
        title = info.get('title', video).replace('"', "'")
        path.write_text('---\n'
                        f'title: "{title}"\n'
                        f'source: https://www.youtube.com/watch?v={video}\n'
                        f"upload_date: {info.get('upload_date', 'unknown')}\n"
                        f"duration_seconds: {info.get('duration', 'unknown')}\n"
                        'channel: GDC (YouTube)\n'
                        'note: auto/official captions, cleaned; for local research only\n'
                        f'---\n\n# {title}\n\n{body}\n', encoding='utf-8')
    return {'id': video, 'title': info.get('title'), 'upload_date': info.get('upload_date'), 'transcript': str(path)}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('title', nargs='?')
    parser.add_argument('--speaker')
    parser.add_argument('--id')
    args = parser.parse_args()
    if args.id:
        print(json.dumps(fetch(args.id), indent=1))
        return 0
    if not args.title:
        parser.error('give a talk title or --id')
    candidates = search(args.title, args.speaker)
    if not candidates or candidates[0]['score'] < 0.6:
        print(json.dumps({'error': 'no confident match on the official GDC channel', 'candidates': candidates[:5]}, indent=1))
        return 1
    result = fetch(candidates[0]['id'])
    result['match_score'] = candidates[0]['score']
    result['other_candidates'] = candidates[1:4]
    print(json.dumps(result, indent=1))
    return 0 if 'transcript' in result else 1


if __name__ == '__main__':
    sys.exit(main())
