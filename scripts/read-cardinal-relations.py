#!/usr/bin/env python3
"""Read the private structural export without extracting paths or executing content."""
import csv
import io
import json
import sys
import zipfile

csv.field_size_limit(32 * 1024 * 1024)
tables = ['risks', 'controls', 'risk_controls', 'risk_process_mappings',
          'control_process_mappings', 'cause_effect_node_mappings', 'risk_analyses', 'org_process_charts']
with zipfile.ZipFile(sys.argv[1]) as archive:
    if sum(i.file_size for i in archive.infolist()) > 256 * 1024 * 1024:
        raise ValueError('Structural export exceeds size limit')
    if len(archive.namelist()) != len(set(archive.namelist())):
        raise ValueError('Duplicate archive member')
    result = {name: list(csv.DictReader(io.StringIO(archive.read(name + '.csv').decode('utf-8-sig'))))
              for name in tables}
    result['readme'] = archive.read('README.txt').decode('utf-8-sig')
    print(json.dumps(result, ensure_ascii=False))
