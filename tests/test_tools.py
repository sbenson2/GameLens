"""Offline tests for the registry, citation checker, verifier parsing and runtime lookup."""
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
import check_citations  # noqa: E402
import sourcelib as lib  # noqa: E402
import verify_sources  # noqa: E402


def entry(**changes):
    base = {'id': 'meier2012-decisions', 'tier': 'gdc', 'title': 'Interesting Decisions',
            'authors': ['Sid Meier'], 'year': 2012, 'venue': 'Game Developers Conference 2012',
            'url': 'https://gdcvault.com/play/1015756/Interesting', 'access': 'free',
            'topics': ['design', 'decisions'], 'summary': 'Decisions are interesting when options trade off.',
            'evidence': 'practitioner', 'checked': {'date': '2026-09-26', 'metadata': 'vault', 'content': 'transcript'}}
    base.update(changes)
    return base


class SchemaTests(unittest.TestCase):
    def test_valid_entry_passes(self):
        self.assertEqual(lib.validate(entry()), [])

    def test_schema_problems_are_named(self):
        problems = ' | '.join(lib.validate(entry(id='Meier', tier='blog', topics=['vibes'], year='2012',
                                                  url='http://x', checked={'date': 'soon'})))
        for fragment in ('id must look like', 'tier must be', 'unknown topics', 'year must be',
                         'url must be https', 'checked.metadata', 'checked.content'):
            self.assertIn(fragment, problems)

    def test_tier_specific_requirements(self):
        self.assertIn('gdcvault.com/play', ' '.join(lib.validate(entry(url='https://youtube.com/watch?v=x'))))
        book = entry(id='schell2019-lenses', tier='book', url='https://example.com/book')
        self.assertIn('isbn', ' '.join(lib.validate(book)))
        self.assertEqual(lib.validate({**book, 'isbn': '9781138632059'}), [])
        paper = entry(id='hunicke2004-mda', tier='peer-reviewed', url='https://example.com/mda.pdf')
        self.assertIn('notes', ' '.join(lib.validate(paper)))
        self.assertEqual(lib.validate({**paper, 'notes': 'AAAI workshop paper'}), [])
        self.assertIn('bare DOI', ' '.join(lib.validate({**paper, 'doi': 'https://doi.org/10.1/x'})))


class TextTests(unittest.TestCase):
    def test_citations_in_order_without_duplicates(self):
        text = 'A [@b2001-x]. B [@a2000-y; @b2001-x]. Not a citation [link](x) or [@Bad].'
        self.assertEqual(lib.citations(text), ['b2001-x', 'a2000-y'])

    def test_title_matching_tolerates_subtitles_not_different_titles(self):
        self.assertTrue(lib.title_matches('Game Feel', "Game Feel: A Game Designer's Guide to Virtual Sensation"))
        self.assertTrue(lib.title_matches('The Motivational Pull of Video Games: A Self-Determination Theory Approach',
                                          'The Motivational Pull of Video Games: A Self-Determination Theory Approach'))
        self.assertFalse(lib.title_matches('Interesting Decisions', 'Saying No to the CEO'))
        self.assertFalse(lib.title_matches('Game Balance', 'Game Design Workshop'))

    def test_surname_folds_accents(self):
        self.assertEqual(lib.surname('Jesper Juul'), 'juul')
        self.assertEqual(lib.surname('Hidemaro Fujibayashi'), 'fujibayashi')
        self.assertEqual(lib.surname('Eyjólfur Guðmundsson'), 'gudmundsson')
        self.assertEqual(lib.fold('Søren Johnson — <i>Æther</i>'), 'soren johnson aether')


class CheckerTests(unittest.TestCase):
    def setUp(self):
        self.temp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.temp)
        (self.temp / 'references').mkdir()
        self.registry = self.temp / 'references' / 'sources.jsonl'
        self.registry.write_text(json.dumps(entry()) + '\n')
        (self.temp / 'SKILL.md').write_text('# Skill\n')
        self.doc = self.temp / 'references' / 'design.md'

    def run_check(self, write=False):
        return check_citations.check(self.registry, self.temp, write)

    def test_write_generates_sources_and_then_passes(self):
        self.doc.write_text('# Design\n\nDecisions matter [@meier2012-decisions].\n')
        errors, _ = self.run_check()
        self.assertTrue(any('stale' in e for e in errors))
        self.run_check(write=True)
        text = self.doc.read_text()
        self.assertIn('## Sources', text)
        self.assertIn('`meier2012-decisions` Sid Meier (2012). Interesting Decisions.', text)
        self.assertEqual(self.run_check()[0], [])
        self.run_check(write=True)
        self.assertEqual(self.doc.read_text(), text)

    def test_unknown_citation_and_duplicates_fail(self):
        self.doc.write_text('# Design\n\nMissing [@nobody2020-x].\n')
        with self.registry.open('a') as f:
            f.write(json.dumps(entry()) + '\n')
            f.write(json.dumps(entry(id='meier2012-other')) + '\n')
        errors = ' | '.join(self.run_check()[0])
        self.assertIn('unknown citation [@nobody2020-x]', errors)
        self.assertIn('duplicate id', errors)
        self.assertIn('same url as meier2012-decisions', errors)

    def test_gendered_pronouns_are_flagged(self):
        self.doc.write_text('# Design\n\nMeier says his rule holds [@meier2012-decisions].\n')
        warnings = check_citations.check(self.registry, self.temp)[1]
        self.assertTrue(any('design.md:3: gendered pronoun' in w for w in warnings))

    def test_uncited_entry_is_a_warning(self):
        self.doc.write_text('# Design\n\nNo citations.\n')
        errors, warnings = self.run_check()
        self.assertEqual(errors, [])
        self.assertTrue(any('never cited' in w for w in warnings))


class VerifierParsingTests(unittest.TestCase):
    def setUp(self):
        self.original = verify_sources.fetch
        self.addCleanup(setattr, verify_sources, 'fetch', self.original)

    def fake(self, responses):
        verify_sources.fetch = lambda url, *a, **k: next(v for key, v in responses.items() if key in url)

    def test_crossref_match_and_mismatch(self):
        message = {'title': ['Interesting Decisions'], 'author': [{'family': 'Meier'}],
                   'issued': {'date-parts': [[2012]]}, 'type': 'journal-article', 'container-title': ['J']}
        self.fake({'crossref': (200, 'application/json', json.dumps({'message': message}))})
        paper = entry(tier='peer-reviewed', doi='10.1/x', url='https://doi.org/10.1/x')
        self.assertEqual(verify_sources.check_doi(paper), ([], []))
        fails, _ = verify_sources.check_doi({**paper, 'title': 'Something Else Entirely', 'year': 2019})
        self.assertTrue(any('title mismatch' in f for f in fails))
        self.assertTrue(any('year 2019' in f for f in fails))

    def test_preprints_fail_and_companion_tracks_warn(self):
        message = {'title': ['Interesting Decisions'], 'author': [{'family': 'Meier'}],
                   'issued': {'date-parts': [[2012]]}, 'type': 'posted-content', 'container-title': []}
        self.fake({'crossref': (200, '', json.dumps({'message': message}))})
        paper = entry(tier='peer-reviewed', doi='10.1/x')
        self.assertTrue(any('preprint' in f for f in verify_sources.check_doi(paper)[0]))
        message.update(type='proceedings-article', **{'container-title': ['CHI Extended Abstracts']})
        self.fake({'crossref': (200, '', json.dumps({'message': message}))})
        self.assertTrue(any('extended-abstract' in w for w in verify_sources.check_doi(paper)[1]))

    def test_vault_page_fields_and_year(self):
        page = ('<dt><h3>Session Name:</h3></dt><dd><p class="x">Interesting Decisions</p></dd>'
                '<dt>\n<strong>Speaker(s):</strong>\n</dt>\n<dd>\n   Sid Meier   </dd>'
                '<meta property="og:image" content="https://media.gdcvault.com/GDCvault_thumb/thumb_gdc12.jpg" />')
        self.fake({'gdcvault': (200, 'text/html', page)})
        self.assertEqual(verify_sources.check_vault(entry(), {}), ([], []))
        fails, _ = verify_sources.check_vault(entry(year=2013, authors=['Raph Koster']), {})
        self.assertTrue(any('speaker mismatch' in f for f in fails))
        self.assertTrue(any('year 2013' in f for f in fails))
        blank = ('<dt><h3>Session Name:</h3></dt><dd><p>Interesting Decisions</p></dd>'
                 '<dt><h3>Speaker(s):</h3></dt><dd><p class="x"></p></dd>'
                 '<dt><h3>Company Name(s):</h3></dt><dd><p>Firaxis</p></dd>')
        self.assertEqual(verify_sources.page_field(blank, 'Speaker(s):'), '')
        self.assertEqual(verify_sources.page_field(blank, 'Company Name(s):'), 'Firaxis')
        catalog = {'1015756': {'conference': 'gdc-online-12'}}
        self.assertEqual(verify_sources.check_vault(entry(), catalog)[0], [])


class RuntimeLookupTests(unittest.TestCase):
    def setUp(self):
        self.temp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.temp)
        (self.temp / 'scripts').mkdir()
        (self.temp / 'references').mkdir()
        shutil.copy(ROOT / 'skills/game-development/scripts/sources.py', self.temp / 'scripts')
        rows = [entry(), entry(id='swink2009-gamefeel', tier='book', isbn='9780123743282', title='Game Feel',
                               authors=['Steve Swink'], year=2009, venue='Morgan Kaufmann',
                               url='https://example.com/gamefeel', topics=['game-feel', 'controls'],
                               summary='Game feel as real-time control of virtual objects.', evidence='theory')]
        (self.temp / 'references' / 'sources.jsonl').write_text(''.join(json.dumps(r) + '\n' for r in rows))

    def run_script(self, *args):
        return subprocess.run([sys.executable, str(self.temp / 'scripts/sources.py'), *args],
                              capture_output=True, text=True)

    def test_find_ranks_and_filters(self):
        out = self.run_script('find', 'controls', 'feel').stdout
        self.assertTrue(out.startswith('swink2009-gamefeel'))
        self.assertNotIn('meier2012', self.run_script('find', '--topic', 'game-feel').stdout)
        self.assertIn('No registered source', self.run_script('find', 'zephyr').stdout)

    def test_show_and_unknown_ids(self):
        shown = self.run_script('show', 'meier2012-decisions')
        self.assertEqual(json.loads(shown.stdout)[0]['year'], 2012)
        missing = self.run_script('show', 'nobody2000-x')
        self.assertEqual(missing.returncode, 1)
        self.assertIn('Unknown ids', missing.stderr)


if __name__ == '__main__':
    unittest.main()


class ApplyFindingsTests(unittest.TestCase):
    def setUp(self):
        import apply_findings
        self.mod = apply_findings
        self.temp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.temp)
        refs = self.temp / 'references'
        refs.mkdir()
        self.saved = (lib.REFERENCES, lib.REGISTRY)
        self.addCleanup(lambda: setattr(lib, 'REFERENCES', self.saved[0]) or setattr(lib, 'REGISTRY', self.saved[1]))
        lib.REFERENCES, lib.REGISTRY = refs, refs / 'sources.jsonl'
        lib.REGISTRY.write_text(json.dumps(entry()) + '\n')
        self.doc = refs / 'design.md'
        self.doc.write_text('# D\n\n  - Players always quit at 100 ms [@meier2012-decisions]. Kept sentence.\n\n## Sources\n\n- x\n')

    def test_replacements_keep_indentation_and_footer(self):
        uses = [{'id': 'meier2012-decisions', 'file': 'design.md', 'line': 3, 'verdict': 'overstated',
                 'quote': 'Players always quit at 100 ms', 'fix': 'In one talk, some players quit'}]
        applied, manual = self.mod.apply_uses(uses, dry_run=False)
        self.assertEqual((applied, manual), (1, []))
        self.assertEqual(self.doc.read_text(),
                         '# D\n\n  - In one talk, some players quit [@meier2012-decisions]. Kept sentence.\n\n## Sources\n\n- x\n')

    def test_removal_and_conflicts(self):
        uses = [{'id': 'a', 'file': 'design.md', 'line': 3, 'verdict': 'unsupported',
                 'quote': 'Players always quit at 100 ms [@meier2012-decisions].', 'fix': ''},
                {'id': 'b', 'file': 'design.md', 'line': 3, 'verdict': 'overstated',
                 'quote': 'always quit', 'fix': 'sometimes quit'},
                {'id': 'c', 'file': 'design.md', 'line': 3, 'verdict': 'overstated',
                 'quote': 'not on the line', 'fix': 'x'}]
        applied, manual = self.mod.apply_uses(uses, dry_run=False)
        self.assertEqual(applied, 1)
        self.assertEqual(sorted(m['id'] for m in manual), ['b', 'c'])
        self.assertIn('  - Kept sentence.', self.doc.read_text())

    def test_registry_fix_updates_fields(self):
        changed, problems = self.mod.apply_registry(
            [{'id': 'meier2012-decisions', 'registry': True, 'verdict': 'fix', 'summary': 'New summary.',
              'checked_content': 'abstract', 'notes_append': 'Rechecked.'}], dry_run=False)
        row = json.loads(lib.REGISTRY.read_text())
        self.assertEqual((changed, problems), (1, []))
        self.assertEqual((row['summary'], row['checked']['content'], row['notes']), ('New summary.', 'abstract', 'Rechecked.'))
