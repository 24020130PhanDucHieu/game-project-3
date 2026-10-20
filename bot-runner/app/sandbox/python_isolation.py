"""Bootstrap executed inside the bot interpreter before any user code."""

CHILD_ISOLATION = r'''
def install_python_isolation():
    import ctypes,errno,os
    libc=ctypes.CDLL(None,use_errno=True)
    sec=ctypes.CDLL("libseccomp.so.2",use_errno=True)
    sec.seccomp_init.argtypes=[ctypes.c_uint32]
    sec.seccomp_init.restype=ctypes.c_void_p
    sec.seccomp_syscall_resolve_name.argtypes=[ctypes.c_char_p]
    sec.seccomp_syscall_resolve_name.restype=ctypes.c_int
    sec.seccomp_rule_add.argtypes=[ctypes.c_void_p,ctypes.c_uint32,ctypes.c_int,ctypes.c_uint]
    sec.seccomp_load.argtypes=[ctypes.c_void_p]
    sec.seccomp_release.argtypes=[ctypes.c_void_p]
    context=sec.seccomp_init(0x7fff0000)
    if not context:raise RuntimeError("seccomp_init unavailable")
    try:
        blocked=("execve","execveat","fork","vfork","clone","clone3","kill","tkill","tgkill",
                 "ptrace","process_vm_readv","process_vm_writev","pidfd_open","pidfd_getfd",
                 "pidfd_send_signal","process_madvise","process_mrelease","prlimit64",
                 "socket","socketpair","connect","bind","listen","accept","accept4",
                 "sendto","sendmsg","sendmmsg","recvfrom","recvmsg","recvmmsg",
                 "io_uring_setup","io_uring_enter","io_uring_register","unshare","setns",
                 "mount","umount2","open_by_handle_at","sched_setaffinity","sched_setparam",
                 "sched_setscheduler","ioprio_set","bpf","perf_event_open","keyctl",
                 "add_key","request_key","reboot","userfaultfd")
        for name in blocked:
            number=sec.seccomp_syscall_resolve_name(name.encode())
            if number>=0 and sec.seccomp_rule_add(context,0x00050000|errno.EPERM,number,0)!=0:
                raise RuntimeError("seccomp rule unavailable")
        if sec.seccomp_load(context)!=0:raise RuntimeError("seccomp_load unavailable")
    finally:sec.seccomp_release(context)
    # No file descriptors other than pipes and /dev/null were inherited.
    # No filesystem paths are granted: code/state arrive exclusively by stdin.
    abi=libc.syscall(444,0,0,1)
    if abi<1:raise RuntimeError("Landlock unavailable")
    rights=(1<<13)-1
    if abi>=2:rights|=1<<13
    if abi>=3:rights|=1<<14
    if abi>=5:rights|=1<<15
    class Ruleset(ctypes.Structure):
        _fields_=[("handled_access_fs",ctypes.c_uint64)]
    rules=Ruleset(rights)
    fd=libc.syscall(444,ctypes.byref(rules),ctypes.sizeof(rules),0)
    if fd<0:raise RuntimeError("landlock_create_ruleset unavailable")
    try:
        if libc.prctl(38,1,0,0,0)<0 or libc.syscall(446,fd,0)<0:
            raise RuntimeError("landlock_restrict_self unavailable")
    finally:os.close(fd)
'''
