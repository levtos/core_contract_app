#!/bin/sh
set -eu
umask 077
mkdir -p /data/secrets
chown -R 10001:10001 /data
chmod 0700 /data/secrets
find /data/secrets -type f -exec chmod 0600 {} \;
exec setpriv --reuid=10001 --regid=10001 --init-groups python -m core_contracts.app
