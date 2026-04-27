#!/usr/bin/env python3
"""
Convert the user-provided certificate template (with example values) into a
docxtemplater-ready template with {placeholder} markers.

Idempotent: run as needed; output goes to templates/cert-template.docx.

Strategy: surgically replace specific <w:t>...</w:t> text content based on
exact match. For multi-run logical values (李+OO, 農業害蟲模+組), replace the
first run's text with the placeholder and blank the subsequent runs.
"""
import zipfile, re, shutil
from pathlib import Path

ROOT = Path(__file__).parent.parent
SRC = Path('/tmp/cert-template.docx')
DST = ROOT / 'templates' / 'cert-template.docx'

# Each tuple: (exact text to find inside <w:t>, replacement text)
# Order matters when same string appears twice — list first occurrence first.
REPLACEMENTS = [
    # Chinese date paragraph: replace prefix run + blank the rest
    ('申請日期：中華民國11', '申請日期：{date_roc}'),
    # English date paragraph: replace prefix + blank the rest
    ('pplication date', 'pplication date: {date_iso}'),
    # Student name (Chinese, split across 2 runs: 李 + OO)
    ('李', '{name_zh}'),
    ('OO', ''),
    # Student ID — appears twice; both should become placeholder
    # (handled below via a separate routine that replaces ALL occurrences)
    # Module name Chinese (split: 農業害蟲模 + 組)
    ('農業害蟲模', '{module_zh}'),
    ('組', ''),  # NOTE: 「組」might also appear elsewhere. Need scoped replace.
    # Module name English
    ('Agricultural Pest Module Course.', '{module_en}.'),
]

# Date-related fragments to BLANK after the prefix has been swapped with {date_roc}/{date_iso}
DATE_FRAGMENTS_TO_BLANK = [
    '5',   # last digit of ROC year 11_5
    '04',  # month
    '27',  # day
    '年',
    '月',
    '日',
    '2026',  # ISO year
    '/',
]


def main():
    DST.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(SRC, DST)

    # Read the document.xml
    with zipfile.ZipFile(DST, 'r') as zin:
        xml = zin.read('word/document.xml').decode('utf-8')
        other_files = {n: zin.read(n) for n in zin.namelist() if n != 'word/document.xml'}

    # Helper to swap exactly-once <w:t>OLD</w:t> with <w:t>NEW</w:t>
    def replace_first(text, old_t, new_t):
        # Use xml:space="preserve" so empty/space-only text is preserved
        pattern = re.compile(r'<w:t([^>]*)>' + re.escape(old_t) + r'</w:t>')
        match = pattern.search(text)
        if not match:
            return text, False
        attrs = match.group(1)
        if 'xml:space' not in attrs:
            attrs = ' xml:space="preserve"' + attrs
        return text[:match.start()] + f'<w:t{attrs}>{new_t}</w:t>' + text[match.end():], True

    def replace_all(text, old_t, new_t):
        pattern = re.compile(r'<w:t([^>]*)>' + re.escape(old_t) + r'</w:t>')
        def sub(m):
            attrs = m.group(1)
            if 'xml:space' not in attrs:
                attrs = ' xml:space="preserve"' + attrs
            return f'<w:t{attrs}>{new_t}</w:t>'
        return pattern.sub(sub, text)

    # Apply replacements in order
    for old, new in REPLACEMENTS:
        before = xml
        # 申請日期 prefix appears once
        # 'pplication date' appears once
        # 李 / OO / 農業害蟲模 / 組 appear once each
        # Module English appears once
        xml, did = replace_first(xml, old, new)
        if not did:
            print(f'⚠️  not found: {old!r}')

    # Replace ALL student_id occurrences (2 of them) with placeholder
    xml = replace_all(xml, '4111036009', '{student_id}')

    # Blank the date fragments. They appear in date paragraphs.
    # We blank only runs whose text exactly matches the fragment.
    for frag in DATE_FRAGMENTS_TO_BLANK:
        xml = replace_all(xml, frag, '')

    # ─── Course table: collapse 5 example rows to 1 row with {#courses} loop ───
    # The table is hardcoded with 5 example rows. We need to:
    #   1. Replace the first row's cell text with {name_zh} {name_en} {credits} {score}
    #   2. Wrap it in {#courses}/{/courses} markers (in 1st cell prefix, last cell suffix)
    #   3. Delete rows 2-5
    course_rows_to_delete = [
        '蟲害概論',
        '農藝作物害蟲管理',
        '果樹害蟲管理技術實務',
    ]
    # The 1st row (普通昆蟲學 + General Entomology) becomes the loop row.
    # The DOC has TWO 普通昆蟲學 rows (row 1 and row 3). We delete row 3 too.
    # Then turn row 1 into the loop.

    # Identify all <w:tr> elements that contain example course names.
    # Match a <w:tr>...</w:tr> block. (This is fragile; works for this template.)
    tr_pattern = re.compile(r'<w:tr\b.*?</w:tr>', re.DOTALL)
    rows = tr_pattern.findall(xml)
    print(f'Found {len(rows)} table rows in document')

    # Turn ALL rows containing 普通昆蟲學/蟲害概論/農藝作物害蟲管理/果樹害蟲管理技術實務
    # into:  first survivor → loop row, rest → deleted.
    survivor_text = None
    deleted = 0
    new_xml = xml
    for marker in ['普通昆蟲學', '蟲害概論', '農藝作物害蟲管理', '果樹害蟲管理技術實務']:
        for row in rows:
            if marker not in row: continue
            if marker == '普通昆蟲學' and survivor_text is None:
                # Make this the loop row
                # Replace 普通昆蟲學 → {name_zh}, General Entomology → {name_en}, 3 → {credits}, 89 → {score}
                # Add {#courses} prefix to first <w:t> and {/courses} suffix to last <w:t>
                new_row = row
                new_row = replace_in_row(new_row, '普通昆蟲學', '{#courses}{name_zh}')
                new_row = replace_in_row(new_row, 'General Entomology', '{name_en}')
                new_row = replace_in_row(new_row, '3', '{credits}', once=True)
                new_row = replace_in_row(new_row, '89', '{score}{/courses}')
                new_xml = new_xml.replace(row, new_row, 1)
                survivor_text = row
            else:
                # Delete this row
                new_xml = new_xml.replace(row, '', 1)
                deleted += 1
    print(f'Loop row prepared; deleted {deleted} example rows')

    xml = new_xml

    # Write back
    with zipfile.ZipFile(DST, 'w', zipfile.ZIP_DEFLATED) as zout:
        zout.writestr('word/document.xml', xml)
        for name, data in other_files.items():
            zout.writestr(name, data)
    print(f'✓ wrote {DST}')


def replace_in_row(row_xml, old_text, new_text, once=False):
    """Replace <w:t>old</w:t> with <w:t>new</w:t> within a single row's XML."""
    pattern = re.compile(r'<w:t([^>]*)>' + re.escape(old_text) + r'</w:t>')
    def sub(m):
        attrs = m.group(1)
        if 'xml:space' not in attrs:
            attrs = ' xml:space="preserve"' + attrs
        return f'<w:t{attrs}>{new_text}</w:t>'
    if once:
        return pattern.sub(sub, row_xml, count=1)
    return pattern.sub(sub, row_xml)


if __name__ == '__main__':
    main()
