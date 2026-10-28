from pathlib import Path
import hashlib,json,stat,subprocess,os,re,time

# This successor is scoped to this exact local owned daemon, never hosted portability.
ENDPOINT='unix:///Users/arbenlila/.docker/run/docker.sock'
DAEMON='6151f33a-603c-49bf-9f98-4a64f85616cf'
DOCKER='/usr/local/bin/docker'
MEMORY=384*1024*1024
LABEL='s8.p2.owner'

def docker_argv(args):
 if os.environ.get('DOCKER_HOST',ENDPOINT)!=ENDPOINT or os.environ.get('DOCKER_CONTEXT'):
  raise ValueError('Ambient Docker endpoint/context override refused')
 if any(arg in ('--host','-H','--context') or arg.startswith(('--host=','--context=')) for arg in args):
  raise ValueError('Caller Docker endpoint selector refused')
 return [DOCKER,'--host',ENDPOINT,*args]

def assert_daemon():
 result=subprocess.run(docker_argv(['info','--format','{{json .ID}}']),stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=5)
 if result.returncode or json.loads(result.stdout)!=DAEMON:raise RuntimeError('Fixed local Docker daemon mismatch')

def validate_owned_inspection(actual,expected):
 if expected.get('daemon')!=DAEMON or expected.get('endpoint')!=ENDPOINT:raise ValueError('Owned daemon binding')
 if not re.fullmatch(r'p2-producer-[a-f0-9]{32}',expected.get('name','')) or expected.get('owner')!=expected['name'][12:]:raise ValueError('Owned generated name')
 if not re.fullmatch(r'[a-f0-9]{64}',actual.get('Id','')) or (expected.get('containerId') and actual['Id']!=expected['containerId']):raise ValueError('Owned full ID')
 config=actual['Config'];host=actual['HostConfig'];state=actual['State']
 if actual['Name']!='/'+expected['name'] or config.get('Labels',{}).get(LABEL)!=expected['owner']:raise ValueError('Owned name/label')
 if config.get('Labels',{}).get('s8.p2.scope')!=expected['scope'] or config.get('Image')!=expected['image']:raise ValueError('Owned scope/image')
 if not re.fullmatch(r'sha256:[a-f0-9]{64}',actual.get('Image','')):raise ValueError('Actual image identity')
 if host.get('NetworkMode')!='none' or not host.get('ReadonlyRootfs') or host.get('CapDrop')!=['ALL'] or host.get('Privileged') or host.get('VolumesFrom'):raise ValueError('Owned containment')
 if not any(x in host.get('SecurityOpt',[]) for x in ['no-new-privileges:true','no-new-privileges']):raise ValueError('Owned privilege containment')
 role=expected['role']
 if role not in ('compile','census','runtime'):raise ValueError('Owned role')
 mounts=actual.get('Mounts',[])
 if role=='compile':
  observed=sorted((m.get('Type'),m.get('Source'),m.get('Destination'),m.get('RW')) for m in mounts)
  wanted=sorted([('bind',expected['producer'],'/build',False),('bind',expected['compileOutput'],'/out',True)])
  if observed!=wanted:raise ValueError('Owned compile mount identity')
 elif mounts or host.get('Binds'):raise ValueError('Owned unexpected mounts')
 if role=='census':
  if state.get('Running') or state.get('StartedAt') not in ('0001-01-01T00:00:00Z',''):raise ValueError('Census container was started')
 else:
  if host.get('Memory')!=MEMORY or host.get('MemorySwap')!=MEMORY or host.get('PidsLimit')!=32 or host.get('NanoCpus')!=1000000000 or host.get('IpcMode')!='none':raise ValueError('Owned resource limits')
  if role=='runtime' and config.get('User')!='65532:65532':raise ValueError('Owned runtime user')
 return actual['Id']

def assert_owned_removed(identifier,expected):
 assert_daemon()
 inspected=subprocess.run(docker_argv(['inspect',identifier]),stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=5)
 if inspected.returncode:
  # A create attempt may fail before returning an ID. Confirm name and ID absence
  # on the same daemon; failed inspect alone never establishes absence.
  listing=subprocess.run(docker_argv(['ps','--all','--no-trunc','--format','{{json .}}']),stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=5)
  if listing.returncode:raise RuntimeError('Cannot establish pending owned creation absence')
  rows=[json.loads(line) for line in listing.stdout.splitlines()]
  if any(row.get('ID')==expected.get('containerId') or expected['name'] in row.get('Names','').split(',') for row in rows):raise RuntimeError('Pending owned creation still exists')
  assert_daemon()
  return {'removeReturncode':None,'successfulDaemonList':True,'exactIdAbsent':True,'exactNameAbsent':True,'daemon':DAEMON}
 actual=json.loads(inspected.stdout)
 if len(actual)!=1:raise ValueError('Owned inspect cardinality')
 full=validate_owned_inspection(actual[0],expected)
 removed=subprocess.run(docker_argv(['rm','--force',full]),stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=15)
 assert_daemon()
 listing=subprocess.run(docker_argv(['ps','--all','--no-trunc','--format','{{.ID}}']),stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=5)
 if listing.returncode or removed.returncode or full in listing.stdout.decode().splitlines():raise RuntimeError('Owned removal not positively confirmed')
 return {'removeReturncode':0,'successfulDaemonList':True,'exactIdAbsent':True,'daemon':DAEMON}

def sha(p):
 h=hashlib.sha256()
 with Path(p).open('rb') as f:
  while True:
   b=f.read(65536)
   if not b:break
   h.update(b)
 return h.hexdigest()

def inventory(root):
 root=Path(root);result={}
 for p in sorted(root.rglob('*')):
  s=p.lstat();name=str(p.relative_to(root))
  if stat.S_ISDIR(s.st_mode):result[name]={'type':'directory','mode':stat.S_IMODE(s.st_mode)}
  elif stat.S_ISREG(s.st_mode):result[name]={'type':'file','mode':stat.S_IMODE(s.st_mode),'bytes':s.st_size,'sha256':sha(p)}
  else:raise ValueError('Unsealed filesystem type: '+name)
 return result
