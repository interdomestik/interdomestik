"""Only extract the finite authenticated-parent file list; ZIP remains untrusted."""
import json,stat,sys,zipfile
from pathlib import Path
archive,listed,output=map(Path,sys.argv[1:]);expected=json.loads(listed.read_text())
if output.exists():raise ValueError('fresh extraction directory required')
if archive.stat().st_size>32*1024*1024:raise ValueError('ZIP byte cap')
if len(expected)!=len(set(expected)) or any(p.startswith('/') or '\\' in p or any(x in ('','.','..') for x in p.split('/')) for p in expected):raise ValueError('expected path list')
with zipfile.ZipFile(archive) as z:
 entries=z.infolist()
 if sorted(i.filename for i in entries)!=sorted(expected):raise ValueError('exact archive file set')
 total=0
 for item in entries:
  mode=item.external_attr>>16
  if item.is_dir() or (stat.S_IFMT(mode) not in (0,stat.S_IFREG)) or item.flag_bits&1:raise ValueError('archive special/encrypted entry')
  if item.file_size<0 or item.file_size>128*1024*1024:raise ValueError('entry size cap')
  total+=item.file_size
  if total>128*1024*1024:raise ValueError('uncompressed byte cap')
 output.mkdir(mode=0o700)
 for item in entries:
  target=output/item.filename;target.parent.mkdir(parents=True,exist_ok=True);observed=0
  with z.open(item) as source,target.open('xb') as dest:
   while True:
    part=source.read(65536)
    if not part:break
    observed+=len(part)
    if observed>item.file_size:raise ValueError('uncompressed declared size mismatch')
    dest.write(part)
  if observed!=item.file_size:raise ValueError('truncated entry')
