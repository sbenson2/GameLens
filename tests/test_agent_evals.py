"""Offline tests for the agent CLI eval harness: event parsing, load detection and URL checks."""
import json
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
import agent_evals  # noqa: E402
import sourcelib as lib  # noqa: E402
from eval_url_graders import url_patterns  # noqa: E402


def lines(*events):
    return '\n'.join(json.dumps(event) for event in events) + '\n'


class LoadDetectionTests(unittest.TestCase):
    def test_skill_calls_and_file_reads_count(self):
        opencode = {'type': 'tool_use', 'part': {'tool': 'skill', 'state': {'input': {'name': 'game-development'}}}}
        qwen = {'type': 'assistant', 'message': {'content': [
            {'type': 'tool_use', 'name': 'skill', 'input': {'skill': 'game-development'}}]}}
        codex = {'type': 'item.started', 'item': {'type': 'command_execution',
                                                  'command': "zsh -lc 'cat .agents/skills/game-development/SKILL.md'"}}
        reference = {'type': 'tool_use', 'part': {'tool': 'read', 'state': {'input': {
            'filePath': '/tmp/gd-eval-x/docs/game-development/references/game-feel.md'}}}}
        for event in (opencode, qwen, codex, reference):
            self.assertTrue(agent_evals.loaded_in(json.dumps(event)), event)

    def test_listings_and_mentions_do_not_count(self):
        init = {'type': 'system', 'subtype': 'init', 'slash_commands': ['game-development'],
                'skills': [{'name': 'game-development', 'path': '/x/game-development/SKILL.md'}]}
        reply = {'type': 'text', 'part': {'text': 'The game-development skill covers this.'}}
        for event in (init, reply):
            self.assertFalse(agent_evals.loaded_in(json.dumps(event)), event)

    def test_copies_outside_the_scratch_directory_are_reported(self):
        stdout = lines(
            {'type': 'tool_use', 'part': {'state': {'input': {
                'filePath': '/Users/dev/game-development/skills/game-development/SKILL.md'}}}},
            {'type': 'tool_use', 'part': {'state': {'input': {
                'filePath': '/var/folders/T/gd-eval-abc/.agents/skills/game-development/SKILL.md'}}}},
            {'type': 'item.started', 'item': {'command': 'cat .agents/skills/game-development/SKILL.md'}})
        self.assertEqual(agent_evals.outside(stdout), ['/Users/dev/game-development/skills/game-development'])


class ReplyParsingTests(unittest.TestCase):
    def test_codex_keeps_the_last_agent_message(self):
        stdout = lines({'type': 'thread.started'},
                       {'type': 'item.completed', 'item': {'type': 'agent_message', 'text': 'Reading the skill.'}},
                       {'type': 'item.completed', 'item': {'type': 'agent_message', 'text': 'Final answer.'}})
        self.assertEqual(agent_evals.parse(stdout), ('Final answer.', None))

    def test_opencode_keeps_text_after_the_last_tool_call(self):
        stdout = lines({'type': 'text', 'part': {'text': 'Let me check the references.'}},
                       {'type': 'tool_use', 'part': {'tool': 'read'}},
                       {'type': 'text', 'part': {'text': 'Raise gravity.'}},
                       {'type': 'text', 'part': {'text': 'Sources: ...'}})
        self.assertEqual(agent_evals.parse(stdout), ('Raise gravity.\n\nSources: ...', None))

    def test_result_events_and_api_errors(self):
        self.assertEqual(agent_evals.parse(lines({'type': 'result', 'result': 'Done.'})), ('Done.', None))
        reply, error = agent_evals.parse(lines({'type': 'result', 'result': '[API Error: 403 denied]'}))
        self.assertIn('403', error)
        _, error = agent_evals.parse(lines({'type': 'turn.failed', 'error': {'message': 'quota'}}))
        self.assertIn('quota', error)

    def test_plain_text_output_is_the_reply(self):
        self.assertEqual(agent_evals.parse('  Just text.\n'), ('Just text.', None))


class CaseTests(unittest.TestCase):
    def test_every_case_has_a_kind_prompt_and_timeout(self):
        found = list(agent_evals.cases())
        self.assertTrue(found)
        for case in found:
            self.assertIn(case['kind'], ('should-fire', 'should-not-fire', 'quality'))
            self.assertTrue(case['prompt'] and case['timeout'] > 0)
            self.assertEqual(case['rubric'] is not None, case['kind'] == 'quality', case['name'])

    def test_readme_gives_the_pointer_the_harness_tests(self):
        self.assertIn(agent_evals.POINTER.strip(), (ROOT / 'README.md').read_text())

    def test_url_patterns_accept_registry_links_only(self):
        entries, _ = lib.load(lib.REGISTRY)
        cites, unlisted = (re.compile(pattern, re.I) for pattern in url_patterns(entries))
        registered = 'See https://gdcvault.com/play/1015756/Interesting.'
        self.assertTrue(cites.search(registered))
        self.assertFalse(unlisted.search(registered))
        self.assertTrue(unlisted.search('See https://example.com/talk'))


if __name__ == '__main__':
    unittest.main()
