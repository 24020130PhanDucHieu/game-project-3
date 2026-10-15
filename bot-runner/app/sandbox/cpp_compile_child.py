"""Linux compiler sandbox: read toolchain only, write one isolated work directory."""
import ctypes
import os
import resource
import sys


def restrict_files(work, compiler):
    libc=ctypes.CDLL(None,use_errno=True)
    # Landlock ABI 1 filesystem rights, supported by Linux >= 5.13.
    read=(1<<0)|(1<<2)|(1<<3)
    all_rights=(1<<13)-1
    class Ruleset(ctypes.Structure):
        _fields_=[('handled_access_fs',ctypes.c_uint64)]
    class PathRule(ctypes.Structure):
        _pack_=1
        _fields_=[('allowed_access',ctypes.c_uint64),('parent_fd',ctypes.c_int32)]
    rules=Ruleset(all_rights)
    fd=libc.syscall(444,ctypes.byref(rules),ctypes.sizeof(rules),0)
    if fd<0: raise RuntimeError('Linux Landlock không khả dụng; không bật biên dịch thiếu cô lập.')
    try:
        toolchain=os.path.dirname(os.path.dirname(os.path.realpath(compiler)))
        for path,access in [(work,all_rights),(toolchain,read),('/usr',read),('/lib',read),('/lib64',read),('/bin',read),('/etc/ld.so.cache',1<<2),('/dev/null',(1<<1)|(1<<2))]:
            if not os.path.exists(path): continue
            parent=os.open(path,os.O_PATH|os.O_CLOEXEC)
            try:
                rule=PathRule(access,parent)
                if libc.syscall(445,fd,1,ctypes.byref(rule),0)<0: raise OSError(ctypes.get_errno(),'landlock_add_rule')
            finally: os.close(parent)
        if libc.prctl(38,1,0,0,0)<0 or libc.syscall(446,fd,0)<0:
            raise OSError(ctypes.get_errno(),'landlock_restrict_self')
    finally: os.close(fd)


if __name__=='__main__':
    work,compiler=sys.argv[1:]
    resource.setrlimit(resource.RLIMIT_CPU,(10,12))
    resource.setrlimit(resource.RLIMIT_AS,(384*1024*1024,384*1024*1024))
    resource.setrlimit(resource.RLIMIT_FSIZE,(8*1024*1024,8*1024*1024))
    resource.setrlimit(resource.RLIMIT_NOFILE,(64,64))
    restrict_files(work,compiler)
    os.execv(compiler,[compiler,'--target=wasm32-wasip1','-std=c++17','-O1','-fno-exceptions','-Wl,--threads=1','-Wl,--max-memory=67108864',os.path.join(work,'bot.cpp'),'-o',os.path.join(work,'bot.wasm')])
