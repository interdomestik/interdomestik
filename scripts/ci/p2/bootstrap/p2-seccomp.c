#define _GNU_SOURCE
#include <node_api.h>
#include <errno.h>
#include <stddef.h>
#include <stdint.h>
#include <unistd.h>
#include <sys/prctl.h>
#include <sys/syscall.h>
#include <linux/audit.h>
#include <linux/filter.h>
#include <linux/sched.h>
#include <linux/seccomp.h>
#if defined(__aarch64__)
#define EXPECTED_ARCH AUDIT_ARCH_AARCH64
#elif defined(__x86_64__)
#define EXPECTED_ARCH AUDIT_ARCH_X86_64
#else
#error Unsupported reviewed syscall architecture
#endif
#define DENY(n) BPF_JUMP(BPF_JMP|BPF_JEQ|BPF_K,(n),0,1), BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_ERRNO|EPERM)
#define THREAD_REQUIRED (CLONE_VM|CLONE_FS|CLONE_FILES|CLONE_SIGHAND|CLONE_THREAD)
#define THREAD_ALLOWED (THREAD_REQUIRED|CLONE_SYSVSEM|CLONE_SETTLS|CLONE_PARENT_SETTID|CLONE_CHILD_CLEARTID|CLONE_CHILD_SETTID)
static napi_value install(napi_env env,napi_callback_info info){
 (void)info;
 struct sock_filter filter[]={
  BPF_STMT(BPF_LD|BPF_W|BPF_ABS,offsetof(struct seccomp_data,arch)),
  BPF_JUMP(BPF_JMP|BPF_JEQ|BPF_K,EXPECTED_ARCH,1,0),
  BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_KILL_PROCESS),
  BPF_STMT(BPF_LD|BPF_W|BPF_ABS,offsetof(struct seccomp_data,nr)),
#if defined(__x86_64__)
  BPF_JUMP(BPF_JMP|BPF_JSET|BPF_K,0x40000000,0,1),
  BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_KILL_PROCESS),
#endif
  /* Opaque clone3 struct cannot be safely dereferenced by seccomp; force libc's clone fallback. */
#ifdef __NR_clone3
  BPF_JUMP(BPF_JMP|BPF_JEQ|BPF_K,__NR_clone3,0,1),
  BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_ERRNO|ENOSYS),
#endif
  /* Only same-address-space runtime threads, with no namespace or process flags. */
  BPF_JUMP(BPF_JMP|BPF_JEQ|BPF_K,__NR_clone,0,12),
  BPF_STMT(BPF_LD|BPF_W|BPF_ABS,offsetof(struct seccomp_data,args[0])+4),
  BPF_JUMP(BPF_JMP|BPF_JEQ|BPF_K,0,1,0),
  BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_ERRNO|EPERM),
  BPF_STMT(BPF_LD|BPF_W|BPF_ABS,offsetof(struct seccomp_data,args[0])),
  BPF_STMT(BPF_ALU|BPF_AND|BPF_K,THREAD_REQUIRED),
  BPF_JUMP(BPF_JMP|BPF_JEQ|BPF_K,THREAD_REQUIRED,1,0),
  BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_ERRNO|EPERM),
  BPF_STMT(BPF_LD|BPF_W|BPF_ABS,offsetof(struct seccomp_data,args[0])),
  BPF_STMT(BPF_ALU|BPF_AND|BPF_K,(uint32_t)~THREAD_ALLOWED),
  BPF_JUMP(BPF_JMP|BPF_JEQ|BPF_K,0,1,0),
  BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_ERRNO|EPERM),
  BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_ALLOW),
  DENY(__NR_execve),DENY(__NR_execveat),
#ifdef __NR_fork
  DENY(__NR_fork),
#endif
#ifdef __NR_vfork
  DENY(__NR_vfork),
#endif
  DENY(__NR_socket),DENY(__NR_socketpair),DENY(__NR_connect),DENY(__NR_bind),DENY(__NR_listen),
  DENY(__NR_accept),DENY(__NR_accept4),DENY(__NR_sendto),DENY(__NR_sendmsg),DENY(__NR_sendmmsg),
  DENY(__NR_ptrace),DENY(__NR_process_vm_readv),DENY(__NR_process_vm_writev),
  DENY(__NR_mount),DENY(__NR_umount2),DENY(__NR_pivot_root),DENY(__NR_chroot),DENY(__NR_unshare),DENY(__NR_setns),
  DENY(__NR_bpf),DENY(__NR_perf_event_open),DENY(__NR_userfaultfd),
  DENY(__NR_io_uring_setup),DENY(__NR_io_uring_enter),DENY(__NR_io_uring_register),
  DENY(__NR_pidfd_open),DENY(__NR_pidfd_getfd),DENY(__NR_pidfd_send_signal),
  DENY(__NR_open_by_handle_at),DENY(__NR_name_to_handle_at),
  DENY(__NR_add_key),DENY(__NR_request_key),DENY(__NR_keyctl),
  DENY(__NR_shmget),DENY(__NR_shmat),DENY(__NR_shmctl),DENY(__NR_semget),DENY(__NR_semop),DENY(__NR_semctl),
  DENY(__NR_msgget),DENY(__NR_msgsnd),DENY(__NR_msgrcv),DENY(__NR_msgctl),
  DENY(__NR_mq_open),DENY(__NR_mq_unlink),DENY(__NR_mq_timedsend),DENY(__NR_mq_timedreceive),
  DENY(__NR_memfd_create),DENY(__NR_memfd_secret),
  DENY(__NR_seccomp),
  BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_ALLOW),
 };
 struct sock_fprog program={.len=(unsigned short)(sizeof filter/sizeof filter[0]),.filter=filter};
 if(prctl(PR_SET_NO_NEW_PRIVS,1,0,0,0)!=0||syscall(__NR_seccomp,SECCOMP_SET_MODE_FILTER,SECCOMP_FILTER_FLAG_TSYNC,&program)!=0){
  napi_throw_error(env,"P2_FILTER_INSTALL_FAILED","Mandatory seccomp TSYNC installation failed");return NULL;
 }
 if(prctl(PR_GET_NO_NEW_PRIVS,0,0,0,0)!=1||prctl(PR_GET_SECCOMP,0,0,0,0)!=SECCOMP_MODE_FILTER){
  napi_throw_error(env,"P2_FILTER_NOT_ACTIVE","Mandatory kernel state not active");return NULL;
 }
 napi_value result;napi_get_boolean(env,1,&result);return result;
}
static napi_value initialize(napi_env env,napi_value exports){
 napi_value fn;if(napi_create_function(env,"install",NAPI_AUTO_LENGTH,install,NULL,&fn)!=napi_ok)return NULL;
 if(napi_set_named_property(env,exports,"install",fn)!=napi_ok)return NULL;
 return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME,initialize)
