from pathlib import Path
import importlib.util,json,os,shutil,stat,sys,tarfile,tempfile,unittest

PRODUCER=Path(__file__).resolve().parents[2]/'p2'
sys.path.insert(0,str(PRODUCER))
spec=importlib.util.spec_from_file_location('p2_backend',PRODUCER/'linux_backend.py')
backend=importlib.util.module_from_spec(spec)
spec.loader.exec_module(backend)

class Layout(unittest.TestCase):
 def test_actual_backend_materialization_matches_every_fixed_file(self):
  with tempfile.TemporaryDirectory(prefix='p2-layout-') as temporary:
   output=Path(temporary)/'capsule'
   backend.materialize_capsule(output)
   layout=json.loads((PRODUCER/'capsule-layout.json').read_text())
   self.assertEqual(sorted(p.name for p in output.iterdir()),sorted(layout))
   for name,source in layout.items():self.assertEqual((output/name).read_bytes(),(PRODUCER/source).read_bytes())
   with self.assertRaises(FileExistsError):backend.materialize_capsule(output)

 def test_umask077_keeps_all_capsule_files_readable_by_runtime_uid(self):
  with tempfile.TemporaryDirectory(prefix='p2-layout-077-') as temporary:
   root=Path(temporary);output=root/'capsule';layout=json.loads((PRODUCER/'capsule-layout.json').read_text())
   previous=os.umask(0o077)
   try:
    # Concrete old primitive witness: bytes match while the runtime cannot read.
    source=PRODUCER/next(iter(layout.values()))
    shutil.copyfile(source,root/'legacy-copy')
    self.assertEqual(stat.S_IMODE((root/'legacy-copy').stat().st_mode),0o600)
    backend.materialize_capsule(output)
   finally:os.umask(previous)
   self.assertEqual(stat.S_IMODE(output.stat().st_mode),0o700)
   for name,source in layout.items():
    target=output/name
    self.assertEqual(target.read_bytes(),(PRODUCER/source).read_bytes())
    self.assertEqual(stat.S_IMODE(target.stat().st_mode),0o644)
    self.assertTrue(target.stat().st_mode & stat.S_IROTH)
    self.assertFalse(target.stat().st_mode & 0o111)

 def test_fixed_image_mode_does_not_inherit_private_producer_read_mode(self):
  with tempfile.TemporaryDirectory(prefix='p2-private-source-') as temporary:
   root=Path(temporary).resolve();producer=root/'producer';(producer/'capsule').mkdir(parents=True)
   source=producer/'capsule/wrapper.mjs';source.write_text('export {};\n');source.chmod(0o600)
   (producer/'capsule-layout.json').write_text(json.dumps({'wrapper.mjs':'capsule/wrapper.mjs'}))
   previous_root=backend.P;previous_umask=os.umask(0o077)
   try:
    backend.P=producer;backend.materialize_capsule(root/'output')
   finally:backend.P=previous_root;os.umask(previous_umask)
   self.assertEqual(stat.S_IMODE((root/'output/wrapper.mjs').stat().st_mode),0o644)
   self.assertEqual(stat.S_IMODE(source.stat().st_mode),0o600)
   self.assertEqual((root/'output/wrapper.mjs').read_bytes(),source.read_bytes())

 def test_real_sealed_tar_preserves_fixed_modes_and_searchable_image_directory(self):
  with tempfile.TemporaryDirectory(prefix='p2-mode-tar-') as temporary:
   root=Path(temporary);(root/'rootfs').mkdir();(root/'sealed').mkdir()
   previous_umask=os.umask(0o077);previous_command=backend.command;calls=[]
   def no_docker(args,timeout=30,stdin=None):
    calls.append(args)
    self.assertEqual(args[:2],['docker','build'])
    Path(args[args.index('--iidfile')+1]).write_text('sha256:'+'1'*64)
    return b''
   try:
    capsule=backend.materialize_capsule(root/'capsule')
    backend.command=no_docker
    backend.seal_build(root/'rootfs',capsule,root/'sealed')
   finally:backend.command=previous_command;os.umask(previous_umask)
   # This is an actual archive test, not a Docker/image execution claim.
   self.assertEqual(len(calls),1)
   with tarfile.open(root/'sealed/sealed-context.tar') as archive:
    self.assertEqual(archive.getmember('capsule').mode,0o755)
    for name in json.loads((PRODUCER/'capsule-layout.json').read_text()):
     self.assertEqual(archive.getmember('capsule/'+name).mode,0o644)

if __name__=='__main__':unittest.main()
