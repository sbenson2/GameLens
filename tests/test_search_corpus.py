"""End-to-end search contracts using a small, independent local corpus."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'tools' / 'search_corpus.py'


class SearchTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        talks = self.root / 'research/transcripts/gdc-youtube'
        talks.mkdir(parents=True)
        (talks / 'one.md').write_text('---\ntitle: "Camera Feel"\nsource: https://www.youtube.com/watch?v=one\n---\n\n# Camera Feel\n\nRepeated camera motion can cause discomfort.\nThe unusual term zephyrjump appears only in the body.\n')
        catalog = self.root / 'research/gdc'
        catalog.mkdir(parents=True)
        self.catalog = catalog / 'vault-catalog.jsonl'
        self.catalog.write_text(json.dumps({'id':'a', 'title':'Camera Feel', 'description':'Camera response', 'url':'https://gdcvault.com/play/a', 'youtube_id':'one'})+'\n'+json.dumps({'id':'b', 'title':'Tower Balance', 'description':'Costs and situational choices.', 'url':'https://gdcvault.com/play/b'})+'\n')

    def run_cli(self, query, *args, ok=True):
        result = subprocess.run([sys.executable, str(SCRIPT), '--root', str(self.root), '--query', query, *args], text=True, capture_output=True)
        self.assertEqual(result.returncode, 0 if ok else 2, result.stderr)
        return json.loads(result.stdout) if ok else result

    def test_transcript_result_has_source_metadata(self):
        result = self.run_cli('camera feel', '--source', 'talks')['results'][0]
        self.assertEqual(result['kind'], 'transcript')
        self.assertTrue(Path(result['path']).is_file())

    def test_title_match_ranks_first_and_limit_applies(self):
        data = self.run_cli('tower balance', '--limit', '1')
        self.assertEqual(len(data['results']), 1)
        self.assertEqual(data['results'][0]['title'], 'Tower Balance')

    def test_transcript_preferred_over_duplicate_catalog_entry(self):
        data = self.run_cli('camera feel', '--source', 'talks')
        self.assertEqual(len(data['results']), 1)
        self.assertEqual(data['results'][0]['kind'], 'transcript')
        self.assertEqual(data['results'][0]['url'], 'https://www.youtube.com/watch?v=one')

    def test_catalog_description_can_match_when_transcript_header_does_not(self):
        # Deduplication must not discard the only match just because a transcript exists.
        result = self.run_cli('response', '--source', 'talks')['results']
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['url'], 'https://gdcvault.com/play/a')

    def test_full_text_is_opt_in_and_result_has_locator(self):
        self.assertEqual(self.run_cli('zephyrjump')['results'], [])
        result = self.run_cli('zephyrjump', '--full-text')['results'][0]
        self.assertIn('zephyrjump', result['snippet'])
        self.assertGreater(result['line'], 4)

    def test_malformed_catalog_row_does_not_hide_valid_entries(self):
        with self.catalog.open('a') as f:
            f.write('{broken\nnull\n')
        data = self.run_cli('tower balance')
        self.assertEqual(data['results'][0]['title'], 'Tower Balance')
        self.assertTrue(data['warnings'])

    def test_missing_corpus_and_empty_query_are_explicit_errors(self):
        empty = self.run_cli('   ', ok=False)
        self.assertIn('query must contain', empty.stderr)
        absent = self.run_cli('camera', '--root', str(self.root/'absent'), ok=False)
        self.assertIn('No selected knowledge sources', absent.stderr)

    def test_search_does_not_modify_corpus(self):
        before = {str(p):p.read_bytes() for p in self.root.rglob('*') if p.is_file()}
        self.run_cli('camera', '--full-text')
        after = {str(p):p.read_bytes() for p in self.root.rglob('*') if p.is_file()}
        self.assertEqual(before, after)


if __name__ == '__main__':
    unittest.main()
