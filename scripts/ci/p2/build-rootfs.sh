#!/bin/sh
set -eu
[ "$(node --version)" = v24.15.0 ]
command -v gcc
mkdir -p /out/rootfs/runtime /out/rootfs/bootstrap /out/rootfs/scratch /out/rootfs/proc /out/rootfs/dev /out/rootfs/etc
# No package installation or network operation. Compiler and headers come from pinned image.
gcc -std=c11 -O2 -Wall -Wextra -Werror -fPIC -shared -DNODE_GYP_MODULE_NAME=p2_seccomp -I/usr/local/include/node /build/bootstrap/p2-seccomp.c -o /out/rootfs/bootstrap/p2-seccomp.node
cp /usr/local/bin/node /out/rootfs/runtime/node
cp /build/bootstrap/entry.mjs /out/rootfs/bootstrap/entry.mjs
for binary in /usr/local/bin/node /out/rootfs/bootstrap/p2-seccomp.node; do
 ldd "$binary" | awk '/=> \// {print $3} /^[[:space:]]*\// {print $1}'
done | sort -u > /out/libraries.txt
while IFS= read -r library; do
 case "$library" in /lib/*|/lib64/*|/usr/lib/*) ;; *) exit 1 ;; esac
 mkdir -p "/out/rootfs$(dirname "$library")"
 cp -L "$library" "/out/rootfs$library"
done < /out/libraries.txt
chmod -R go-w /out/rootfs
chmod 0755 /out/rootfs/runtime/node
printf '{"nodeVersion":"24.15.0","buildNetwork":"none","qualifyingRun":false}\n' > /out/rootfs/bootstrap/build-info.json
