"""Fixed protected producer backend; only synthetic closed capsule enters a container.
The Node parent authenticates this entire directory before invoking this file.
No CLI-selected image, entry, source, mount, environment, or exclusion is accepted.
"""
from pathlib import Path
import hashlib,io,json,os,shutil,signal,subprocess,sys,tarfile,uuid
from custody import inventory,sha,assert_owned_removed as remove_confirmed, docker_argv, assert_daemon, validate_owned_inspection, ENDPOINT, DAEMON, LABEL
from bounded_child import collect
P=Path(__file__).resolve().parent
JOURNAL=None
OWNED={}
SCOPE=None
def journal(event,**fields):
 if JOURNAL is not None:
  row=(json.dumps({'event':event,**fields})+'\n').encode()
  if len(row)>65536 or (JOURNAL.exists() and JOURNAL.stat().st_size+len(row)>1024*1024):raise ValueError('Owned journal cap')
  fd=os.open(JOURNAL,os.O_WRONLY|os.O_CREAT|os.O_APPEND|os.O_NOFOLLOW,0o600)
  try:os.write(fd,row)
  finally:os.close(fd)
def assert_owned_removed(identifier):
 try:
  expected=next((item for item in OWNED.values() if identifier in (item['name'],item.get('containerId'))),None)
  if expected is None:raise ValueError('Unknown owned container')
  receipt=remove_confirmed(identifier,expected);journal('removed',name=expected['name'],containerId=expected.get('containerId'),receipt=receipt);del OWNED[expected['name']];return receipt
 except BaseException as error:
  journal('cleanup-failed',containerId=identifier,error=type(error).__name__);raise
RECIPE='''FROM scratch
COPY --chown=0:0 rootfs /
COPY --chown=0:0 capsule /capsule
USER 65532:65532
WORKDIR /capsule
ENV PATH=/runtime HOME=/scratch TMPDIR=/scratch TZ=UTC LANG=C.UTF-8
ENTRYPOINT ["/runtime/node","--max-old-space-size=256","--no-global-search-paths","--disable-sigusr1","--unhandled-rejections=strict","/bootstrap/entry.mjs"]
CMD ["suite"]
'''

def command(args,timeout=30,stdin=None):
 if args[0]=='docker':args=docker_argv(args[1:])
 p=subprocess.run(args,stdin=stdin,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout)
 if p.returncode:raise RuntimeError('Fixed producer command failed: '+args[0]+' '+args[1]+' '+p.stderr.decode(errors='replace')[:1000])
 return p.stdout

def inspect(identifier):return json.loads(command(['docker','inspect',identifier]))[0]

def create_owned(args,role,image,compile_output=None):
 assert_daemon()
 owner=uuid.uuid4().hex;name='p2-producer-'+owner
 expected={'name':name,'owner':owner,'scope':SCOPE,'role':role,'image':image,'producer':str(P),'compileOutput':str(compile_output) if compile_output else None,'daemon':DAEMON,'endpoint':ENDPOINT}
 OWNED[name]=expected;journal('create-attempt',expected=expected)
 identifier=command(['docker','create','--pull=never','--name',name,'--label',LABEL+'='+owner,'--label','s8.p2.scope='+SCOPE,*args]).decode().strip()
 if len(identifier)!=64 or any(c not in '0123456789abcdef' for c in identifier):raise ValueError('Invalid owned container identity')
 expected['containerId']=identifier
 validate_owned_inspection(inspect(identifier),expected)
 journal('created',expected=expected)
 return identifier

def run_owned(identifier,timeout=12):
 try:
  proc=subprocess.Popen(docker_argv(['start','--attach',identifier]),stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,close_fds=True,start_new_session=True)
  capture=collect(proc,timeout=timeout)
  if capture['reason']:
   # Cleanup always runs even if kill reports already stopped/daemon failure.
   command(['docker','kill',identifier])
  state=inspect(identifier)['State']
  if state['Running'] or state['ExitCode']!=0 or capture['reason'] or capture['exitCode']!=0:raise ValueError('Owned runtime did not complete successfully')
  return capture
 finally:assert_owned_removed(identifier)

def compile_rootfs(output,policy):
 image=inspect(policy['officialImage'])
 if image['Os']+'/'+image['Architecture'] not in policy['architectures']:raise ValueError('Unqualified actual image architecture')
 if policy['officialImage'] not in image.get('RepoDigests',[]):raise ValueError('Official immutable image identity')
 output.mkdir(mode=0o700)
 identifier=create_owned(['--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges:true','--memory=384m','--memory-swap=384m','--pids-limit=32','--cpus=1','--ipc=none','--log-driver=none','--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=16m','--mount','type=bind,src='+str(P)+',dst=/build,readonly','--mount','type=bind,src='+str(output)+',dst=/out',policy['officialImage'],'/bin/sh','/build/build-rootfs.sh'],'compile',policy['officialImage'],output)
 run_owned(identifier,timeout=60)
 if inventory(output/'rootfs')!=policy['rootfs']:raise ValueError('Compiled fixed rootfs exact set/type/hash mismatch')
 return output/'rootfs'

def seal_build(rootfs,capsule,output):
 roots={'rootfs':rootfs,'capsule':capsule};before={name:inventory(root) for name,root in roots.items()}
 archive=output/'sealed-context.tar'
 with tarfile.open(archive,'w',format=tarfile.USTAR_FORMAT) as tar:
  item=tarfile.TarInfo('Dockerfile');data=RECIPE.encode();item.mode=0o644;item.size=len(data);tar.addfile(item,io.BytesIO(data))
  for name,root in roots.items():
   item=tarfile.TarInfo(name);item.type=tarfile.DIRTYPE;item.mode=0o755;tar.addfile(item)
   for relative,record in before[name].items():
    item=tarfile.TarInfo(name+'/'+relative);item.mode=record['mode']
    if record['type']=='directory':item.type=tarfile.DIRTYPE;tar.addfile(item)
    else:
     item.size=record['bytes']
     with (root/relative).open('rb') as f:tar.addfile(item,f)
 if {name:inventory(root) for name,root in roots.items()}!=before:raise ValueError('Source changed during seal')
 archive.chmod(0o400);archive_hash=sha(archive)
 with archive.open('rb') as f:command(['docker','build','--network=none','--pull=false','--iidfile',str(output/'image.id'),'-'],timeout=120,stdin=f)
 if sha(archive)!=archive_hash:raise ValueError('Sealed archive changed')
 image=(output/'image.id').read_text().strip()
 if not image.startswith('sha256:') or len(image)!=71:raise ValueError('Invalid fixed image identity')
 return image,before,archive_hash

def census_image(image,roots):
 expected={}
 for name,entries in roots.items():
  for relative,record in entries.items():
   if record['type']=='file':expected[('' if name=='rootfs' else 'capsule/')+relative]=record
 identifier=create_owned(['--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges:true',image],'census',image)
 records={};directories=[];special=[];total=0
 try:
  proc=subprocess.Popen(docker_argv(['export',identifier]),stdout=subprocess.PIPE,stderr=subprocess.PIPE)
  try:
   with tarfile.open(fileobj=proc.stdout,mode='r|') as tar:
    for item in tar:
     name=item.name.removeprefix('./')
     if name.startswith('/') or '..' in name.split('/'):raise ValueError('Image traversal')
     if item.uid!=0 or item.gid!=0:raise ValueError('Unexpected image owner')
     if item.isdir():directories.append(name.rstrip('/'));continue
     if item.issym():special.append((name,item.linkname));continue
     if not item.isfile() or name in records:raise ValueError('Unsealed image filesystem type/duplicate')
     total+=item.size
     if total>256*1024*1024:raise ValueError('Image size cap')
     h=hashlib.sha256();f=tar.extractfile(item)
     while True:
      part=f.read(65536)
      if not part:break
      h.update(part)
     records[name]={'type':'file','mode':item.mode,'bytes':item.size,'sha256':h.hexdigest()}
   proc.stdout.close()
   if proc.wait(timeout=5)!=0:raise ValueError('Image export failure')
  finally:
   if proc.poll() is None:proc.kill();proc.wait(timeout=5)
   proc.stderr.close()
  if any(records.get(name)!=record for name,record in expected.items()):raise ValueError('Actual image bytes/modes not sealed')
  if set(records)-set(expected) != {'.dockerenv','etc/hostname','etc/hosts','etc/resolv.conf','dev/console'}:raise ValueError('Unexpected actual image files')
  if records['dev/console']['bytes']!=0 or special!=[('etc/mtab','/proc/mounts')]:raise ValueError('Unexpected image special entry')
  expected_dirs={n for n,r in roots['rootfs'].items() if r['type']=='directory'}|{'capsule'}|{'capsule/'+n for n,r in roots['capsule'].items() if r['type']=='directory'}
  if not expected_dirs<=set(directories) or set(directories)-expected_dirs-{'dev/pts','dev/shm','sys'}:raise ValueError('Actual image directory census')
  return {'imageId':image,'expectedFiles':expected,'regularFiles':records,'directories':directories,'special':special,'complete':True}
 finally:assert_owned_removed(identifier)

def run_suite(image):
 identifier=create_owned(['--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges:true','--memory=384m','--memory-swap=384m','--pids-limit=32','--cpus=1','--ulimit','core=0','--ulimit','nofile=64:64','--log-driver=none','--ipc=none','--user','65532:65532','--tmpfs','/scratch:rw,noexec,nosuid,nodev,size=16m,uid=65532,gid=65532,mode=0700',image,'suite'],'runtime',image)
 try:
  state=inspect(identifier);h=state['HostConfig']
  if state['Image']!=image or state['Config']['User']!='65532:65532':raise ValueError('Actual runtime identity')
  if sorted(state['Config']['Env'])!=sorted(['PATH=/runtime','HOME=/scratch','TMPDIR=/scratch','TZ=UTC','LANG=C.UTF-8']):raise ValueError('Actual environment')
  if h.get('Binds') or h.get('VolumesFrom') or h.get('Privileged') or state['Mounts']:raise ValueError('Host mount authority')
  if not(h['NetworkMode']=='none' and h['ReadonlyRootfs'] and h['CapDrop']==['ALL'] and h['IpcMode']=='none' and h['PidMode']==''):raise ValueError('Namespace/capability enforcement')
  if not(h['Memory']==384*1024*1024 and h['MemorySwap']==384*1024*1024 and h['PidsLimit']==32 and h['NanoCpus']==1000000000):raise ValueError('Resource enforcement')
  if set(h['Tmpfs'])!={'/scratch'} or '/proc/kcore' not in h['MaskedPaths'] or '/proc/sys' not in h['ReadonlyPaths']:raise ValueError('Scratch/proc enforcement')
  if not any(x in h['SecurityOpt'] for x in ['no-new-privileges:true','no-new-privileges']):raise ValueError('New privileges available')
 except BaseException:
  assert_owned_removed(identifier);raise
 return run_owned(identifier)

def materialize_capsule(output):
 layout=json.loads((P/'capsule-layout.json').read_text());output.mkdir(mode=0o700)
 for name,relative in layout.items():
  source=P/relative
  if Path(name).name!=name or not relative.startswith('capsule/') or '..' in Path(relative).parts or source.is_symlink() or not source.is_file() or source.resolve()!=source:raise ValueError('Fixed capsule layout path')
  shutil.copyfile(source,output/name)
  # Closed capsule files are non-executable data/modules. Apply the qualified
  # 0644 image mode explicitly; neither producer modes nor umask choose it.
  (output/name).chmod(0o644)
 return output

def main():
 global JOURNAL,SCOPE
 if len(sys.argv)!=2:raise ValueError('Only fixed owned output argument')
 output=Path(sys.argv[1]).resolve()
 if output.exists():raise ValueError('Output must be fresh')
 if shutil.disk_usage(output.parent).free<=10*1024**3:raise ValueError('10GiB floor')
 output.mkdir(mode=0o700)
 JOURNAL=output/'owned-containers.jsonl'
 SCOPE=hashlib.sha256(str(output).encode()).hexdigest();assert_daemon()
 journal('scope',scope=SCOPE,daemon=DAEMON,endpoint=ENDPOINT)
 policy=json.loads((P/'policy.json').read_text());before=inventory(P)
 rootfs=compile_rootfs(output/'compile',policy)
 image,roots,archive_hash=seal_build(rootfs,materialize_capsule(output/'capsule'),output)
 census=census_image(image,roots);(output/'image-census.json').write_text(json.dumps(census,indent=2)+'\n')
 capture=run_suite(image)
 if inventory(P)!=before or inventory(rootfs)!=roots['rootfs']:raise ValueError('Protected input bookend drift')
 (output/'observations.json').write_bytes(capture['stdout'])
 report={'version':1,'imageId':image,'architecture':'linux/arm64','sealedArchiveSha256':archive_hash,'imageCensusSha256':sha(output/'image-census.json'),'observationSha256':sha(output/'observations.json'),'observedBytes':capture['observedBytes'],'retainedBytes':capture['retainedBytes'],'sourceBookendUnchanged':True,'ownedCleanupConfirmed':True,'wholeGuardPass':False,'nativeAdmission':False}
 (output/'result.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
if __name__=='__main__':
 def stopped(signum,frame):raise SystemExit('Protected parent cancelled backend')
 signal.signal(signal.SIGTERM,stopped)
 try:main()
 except BaseException as error:
  journal('failed',error=type(error).__name__,nativeAdmission=False)
  raise
 finally:
  failures=[]
  for expected in list(OWNED.values()):
   try:assert_owned_removed(expected.get('containerId',expected['name']))
   except BaseException as error:failures.append(type(error).__name__)
  if failures:raise RuntimeError('Owned P2 cleanup incomplete')
