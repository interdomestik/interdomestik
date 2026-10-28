// Fixed producer-owned nonexecuting native control. Never accept a caller program.
export const nativeProbeSource = String.raw`"""Finite nonexecuting Darwin mapping controls, freshly executed by the trusted driver."""
import ctypes, errno, hashlib, json, mmap, os, struct, subprocess, sys
from pathlib import Path

config_path, mode = sys.argv[1:]
c = json.loads(Path(config_path).read_text())

def mapping(file):
    fd = os.open(file, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        memory = mmap.mmap(fd, 4096, flags=mmap.MAP_PRIVATE, prot=mmap.PROT_READ | mmap.PROT_EXEC)
        memory.close()
    finally:
        os.close(fd)

def xattr(file, remove=False):
    lib = ctypes.CDLL(None, use_errno=True)
    name = b'com.interdomestik.m4.kerneltest'
    if remove:
        fn = lib.removexattr
        fn.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_int]
        ret = fn(os.fsencode(file), name, 0)
    else:
        fn = lib.setxattr
        fn.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_void_p, ctypes.c_size_t, ctypes.c_uint32, ctypes.c_int]
        buf = ctypes.create_string_buffer(b'1')
        ret = fn(os.fsencode(file), name, buf, 1, 0, 0)
    if ret:
        raise OSError(ctypes.get_errno(), 'xattr refused')

if mode == 'fd':
    rows = []
    for fd in range(256):
        try:
            stat = os.fstat(fd)
            rows.append({'dev': stat.st_dev, 'ino': stat.st_ino})
        except OSError:
            pass
    print(json.dumps(rows))
elif mode == 'protected':
    rows = []
    for file in [c['node'], *c['mapFiles']]:
        try:
            mapping(file)
            rows.append({'mappedRX': True, 'executedBytes': False})
        except OSError as error:
            rows.append({'mappedRX': False, 'denied': error.errno in (errno.EACCES, errno.EPERM), 'executedBytes': False})
    attrs = []
    for file in c['targets']:
        try:
            xattr(file)
            xattr(file, True)
            attrs.append({'unexpectedSuccess': True})
        except OSError as error:
            attrs.append({'denied': error.errno in (errno.EACCES, errno.EPERM)})
    print(json.dumps({'rows': rows, 'attrs': attrs}))
elif mode == 'calibrate-and-protect':
    class Signature(ctypes.Structure):
        _fields_ = [('fs_file_start', ctypes.c_int64), ('fs_blob_start', ctypes.c_void_p), ('fs_blob_size', ctypes.c_size_t)]

    expected = hashlib.sha256(Path(c['node']).read_bytes()).hexdigest()
    for file in c['targets']:
        xattr(file)
        xattr(file, True)
    opened = []
    try:
        writable = os.open(c['targets'][0], os.O_RDWR)
        opened.append(writable)
        identity = os.fstat(writable)
        command = [sys.executable, '-I', '-S', '-B', __file__, config_path, 'fd']
        positive = subprocess.run(command, capture_output=True, pass_fds=(writable,),
                                  timeout=5, check=True)
        if not any(row['dev'] == identity.st_dev and row['ino'] == identity.st_ino
                   for row in json.loads(positive.stdout)):
            raise ValueError('Explicit code FD positive failed')
        negative = subprocess.run(command, capture_output=True, close_fds=True,
                                  timeout=5, check=True)
        if any(row['dev'] == identity.st_dev and row['ino'] == identity.st_ino
               for row in json.loads(negative.stdout)):
            raise ValueError('Code FD leaked through closed launch')
        for file in c['mapFiles']:
            if hashlib.sha256(Path(file).read_bytes()).hexdigest() != expected:
                raise ValueError('Exact signed Node copy required')
            fd = os.open(file, os.O_RDONLY | os.O_NOFOLLOW)
            opened.append(fd)
            stat = os.fstat(fd)
            if stat.st_nlink != 1:
                raise ValueError('Single-link native data required')
            values = struct.unpack('<8I', os.pread(fd, 32, 0))
            if values[0] != 0xfeedfacf or values[1] != 0x0100000c or not 0 < values[4] < 1024 or values[5] > 1024*1024:
                raise ValueError('Thin ARM64 signature input')
            commands = os.pread(fd, values[5], 32)
            offset, signature = 0, None
            for _ in range(values[4]):
                command, size = struct.unpack_from('<II', commands, offset)
                if size < 8 or offset + size > len(commands):
                    raise ValueError('Bounded MachO command')
                if command == 0x1d:
                    if signature is not None or size != 16:
                        raise ValueError('One code signature')
                    signature = struct.unpack_from('<II', commands, offset+8)
                offset += size
            if not signature or signature[0]+signature[1] > stat.st_size:
                raise ValueError('Signature bounds')
            value = Signature(0, signature[0], signature[1])
            lib = ctypes.CDLL(None, use_errno=True)
            call = lib.fcntl
            call.argtypes, call.restype = [ctypes.c_int, ctypes.c_int], ctypes.c_int
            if call(fd, 61, ctypes.byref(value)):
                raise OSError(ctypes.get_errno(), 'Owned signature registration')
            mapping(file)
        result = subprocess.run(
            ['/usr/bin/sandbox-exec', '-f', c['descendantProfile'], sys.executable,
             '-I', '-S', '-B', __file__, config_path, 'protected'],
            cwd=c['code'], env=dict(PATH='/usr/bin:/bin', HOME=c['output'], TMPDIR=c['tmp'],
                                  LANG='C', TZ='UTC', PYTHONDONTWRITEBYTECODE='1'),
            capture_output=True, close_fds=True, timeout=15, check=True)
        value = json.loads(result.stdout)
        if not value['rows'][0].get('mappedRX') or len(value['rows']) != 4:
            raise ValueError('Trusted native RX positive')
        if not all(row.get('denied') and not row['mappedRX'] for row in value['rows'][1:]):
            raise ValueError('Three native map denials required')
        if len(value['attrs']) != 3 or not all(row.get('denied') for row in value['attrs']):
            raise ValueError('Three actual xattr denials required')
        print(json.dumps({'unconfinedRX': 3, 'protected': value, 'executedBytes': False,
                          'explicitFDPositive': True, 'closedFDNegative': True}))
    finally:
        for fd in opened:
            os.close(fd)
else:
    raise ValueError('Fixed native control mode required')
`;
