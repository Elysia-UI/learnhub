#!/usr/bin/env bash
set -euo pipefail
umask 077
public_host='__PUBLIC_HOST__'
certificate="/var/lib/learnhub-acme/certificates/${public_host}.crt"
key="/var/lib/learnhub-acme/certificates/${public_host}.key"
destination='/etc/learnhub/tls'

openssl x509 -in "$certificate" -noout -checkend 3600
openssl x509 -in "$certificate" -noout -checkip "$public_host"
cert_public=$(openssl x509 -in "$certificate" -pubkey -noout | openssl pkey -pubin -outform DER | openssl dgst -sha256)
key_public=$(openssl pkey -in "$key" -pubout -outform DER | openssl dgst -sha256)
test "$cert_public" = "$key_public"
install -d -m 0750 -o root -g learnhub-proxy "$destination"
previous=false
if [[ -f "$destination/fullchain.pem" && -f "$destination/privkey.pem" ]]; then
    install -m 0640 -o root -g learnhub-proxy "$destination/fullchain.pem" "$destination/fullchain.previous"
    install -m 0640 -o root -g learnhub-proxy "$destination/privkey.pem" "$destination/privkey.previous"
    previous=true
fi
install -m 0640 -o root -g learnhub-proxy "$certificate" "$destination/fullchain.next"
install -m 0640 -o root -g learnhub-proxy "$key" "$destination/privkey.next"
mv -f "$destination/fullchain.next" "$destination/fullchain.pem"
mv -f "$destination/privkey.next" "$destination/privkey.pem"
if ! runuser -u learnhub-proxy -- /opt/learnhub/bin/caddy validate --config /etc/learnhub/Caddyfile --adapter caddyfile; then
    if "$previous"; then
        install -m 0640 -o root -g learnhub-proxy "$destination/fullchain.previous" "$destination/fullchain.pem"
        install -m 0640 -o root -g learnhub-proxy "$destination/privkey.previous" "$destination/privkey.pem"
    fi
    exit 1
fi
if systemctl is-active --quiet learnhub-proxy; then
    systemctl reload learnhub-proxy
fi
