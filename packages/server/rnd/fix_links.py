#!/usr/bin/env python3
"""Fix broken single-letter directory links in docs."""

import os
import re
import sys

DOCS_ROOT = "/Users/s/Documents/Game Dev/Projects/GameCodex/docs"

# Map every doc file by its basename
file_map = {}
for root, dirs, files in os.walk(DOCS_ROOT):
    for f in files:
        if f.endswith('.md'):
            full = os.path.join(root, f)
            file_map[f] = full

# Pattern: ../X/filename.md where X is a single letter
LINK_RE = re.compile(r'\.\./([A-Z])/([A-Za-z0-9_]+\.md)')

def fix_file(filepath):
    with open(filepath, 'r') as fh:
        content = fh.read()
    
    file_dir = os.path.dirname(filepath)
    changes = []
    
    def replace_link(match):
        old = match.group(0)
        letter = match.group(1)
        filename = match.group(2)
        
        if filename in file_map:
            target = file_map[filename]
            rel = os.path.relpath(target, file_dir)
            changes.append((old, rel))
            return rel
        else:
            changes.append((old, f"MISSING:{filename}"))
            return old  # leave as-is if target doesn't exist
    
    new_content = LINK_RE.sub(replace_link, content)
    
    if content != new_content:
        with open(filepath, 'w') as fh:
            fh.write(new_content)
        print(f"\nFIXED: {os.path.relpath(filepath, DOCS_ROOT)}")
        for old, new in changes:
            print(f"  {old} → {new}")
        return len(changes)
    return 0

total = 0
for root, dirs, files in os.walk(DOCS_ROOT):
    for f in files:
        if f.endswith('.md'):
            total += fix_file(os.path.join(root, f))

print(f"\n=== Total links fixed: {total} ===")
