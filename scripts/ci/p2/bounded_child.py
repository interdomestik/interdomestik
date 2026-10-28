"""Trusted parent pipe collector: cap memory while reading, before JSON parsing."""
import os,selectors,signal,time
MAX_BYTES=65536
class InvalidObservation(ValueError):pass

def collect(proc, *, timeout, max_bytes=MAX_BYTES):
 if timeout<=0 or not 1<=max_bytes<=MAX_BYTES:raise ValueError('fixed collector limits')
 started=time.monotonic();deadline=started+timeout
 channels={'stdout':bytearray(),'stderr':bytearray()};observed=0;reason=None
 selector=selectors.DefaultSelector()
 for name,pipe in [('stdout',proc.stdout),('stderr',proc.stderr)]:
  os.set_blocking(pipe.fileno(),False);selector.register(pipe,selectors.EVENT_READ,name)
 def terminate():
  try:os.killpg(proc.pid,signal.SIGKILL)
  except ProcessLookupError:pass
  proc.wait(timeout=2)
 try:
  while selector.get_map():
   remaining=deadline-time.monotonic()
   if remaining<=0:reason='timeout';terminate();break
   for key,_ in selector.select(remaining):
    # Never read or retain an attacker-sized chunk. A single extra byte detects overflow.
    part=os.read(key.fd,min(8192,max_bytes-observed+1))
    if not part:selector.unregister(key.fileobj);continue
    observed+=len(part)
    if observed>max_bytes:reason='output-overflow';terminate();break
    channels[key.data].extend(part)
   if reason:break
  if not reason:
   try:proc.wait(timeout=max(.001,deadline-time.monotonic()))
   except __import__('subprocess').TimeoutExpired:reason='timeout';terminate()
 finally:
  selector.close()
  proc.stdout.close();proc.stderr.close()
  if proc.poll() is None:terminate()
 return {'stdout':bytes(channels['stdout']),'stderr':bytes(channels['stderr']),'reason':reason,
         'observedBytes':observed,'retainedBytes':sum(map(len,channels.values())),
         'exitCode':proc.returncode,'reaped':proc.poll() is not None,'elapsedSeconds':time.monotonic()-started}

def parse_suite(raw, expected_names):
 import json
 try:value=json.loads(raw)
 except (UnicodeError,ValueError) as error:raise InvalidObservation('malformed or truncated JSON') from error
 if not isinstance(value,dict) or set(value)!={'kind','cases','suites'} or value['kind']!='untrusted-wrapper-observations-v1':raise InvalidObservation('wrong observation schema')
 expected=[{'name':name,'state':'pass'} for name in expected_names]
 if value['cases']!=expected:raise InvalidObservation('wrong or failed exact cases')
 if value['suites']!=[{'name':'wrapper.test.mjs','state':'pass'},{'name':'assignClaimCore (Wrapper Means)','state':'pass'}]:raise InvalidObservation('wrong or failed suites')
 return value
