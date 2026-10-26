from pathlib import Path
import json,subprocess,tempfile,zipfile,stat,unittest,warnings
HELPER=Path(__file__).resolve().parents[2]/'p2/unpack-ordinary.py'
class Extraction(unittest.TestCase):
 def run_case(self,entries,expected,success):
  with tempfile.TemporaryDirectory(prefix='p2-zip-') as temp:
   root=Path(temp);archive=root/'input.zip';listing=root/'expected.json';listing.write_text(json.dumps(expected))
   with warnings.catch_warnings():
    warnings.simplefilter('ignore')
    with zipfile.ZipFile(archive,'w') as z:
     for name,data,mode in entries:
      item=zipfile.ZipInfo(name);item.external_attr=mode<<16;z.writestr(item,data)
   result=subprocess.run(['/usr/bin/python3','-B',str(HELPER),str(archive),str(listing),str(root/'output')],capture_output=True,timeout=5)
   self.assertEqual(result.returncode==0,success,result.stderr.decode())
   if success:self.assertEqual(sorted(str(p.relative_to(root/'output')) for p in (root/'output').rglob('*') if p.is_file()),sorted(expected))
 def test_exact_regular_files(self):self.run_case([('ordinary-context.json',b'{}',stat.S_IFREG|0o644)],['ordinary-context.json'],True)
 def test_extra_file(self):self.run_case([('ordinary-context.json',b'{}',stat.S_IFREG|0o644),('extra',b'x',stat.S_IFREG|0o644)],['ordinary-context.json'],False)
 def test_duplicate(self):self.run_case([('ordinary-context.json',b'{}',stat.S_IFREG|0o644)]*2,['ordinary-context.json'],False)
 def test_traversal(self):self.run_case([('../outside',b'x',stat.S_IFREG|0o644)],['ordinary-context.json'],False)
 def test_symlink(self):self.run_case([('ordinary-context.json',b'/etc/passwd',stat.S_IFLNK|0o777)],['ordinary-context.json'],False)
 def test_directory(self):self.run_case([('ordinary-context.json',b'',stat.S_IFDIR|0o755)],['ordinary-context.json'],False)
 def test_missing_required_web_summary(self):
  names=['ordinary-context.json','apps/web/coverage/coverage-final.json','packages/shared-auth/coverage/coverage-summary.json']
  self.run_case([(name,b'{}',stat.S_IFREG|0o644) for name in names],names+['apps/web/coverage/coverage-summary.json'],False)
 def test_required_web_summary_present(self):
  names=['ordinary-context.json','apps/web/coverage/coverage-final.json','apps/web/coverage/coverage-summary.json','packages/shared-auth/coverage/coverage-summary.json']
  self.run_case([(name,b'{}',stat.S_IFREG|0o644) for name in names],names,True)
if __name__=='__main__':unittest.main()
