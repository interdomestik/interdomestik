from pathlib import Path
import hashlib,json,stat,subprocess

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

def assert_owned_removed(identifier):
 # Successful daemon listing is required; an auth/transport error is not absence.
 removed=subprocess.run(['docker','rm','--force',identifier],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=15)
 listing=subprocess.run(['docker','ps','--all','--no-trunc','--format','{{.ID}}'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=15)
 if listing.returncode!=0:raise RuntimeError('Cannot establish container absence: daemon listing failed')
 absent=identifier not in listing.stdout.decode().splitlines()
 if removed.returncode!=0 or not absent:raise RuntimeError('Owned removal not positively confirmed')
 return {'removeReturncode':removed.returncode,'successfulDaemonList':True,'exactIdAbsent':absent}
