# Option C — Direct-to-VM HTTPS (bypass Cloudflare) for AU WiFi

**Goal:** make `https://proctor.jesoas.org` reachable on AU WiFi so the **already-
published extension keeps working unchanged** (no per-device setup) for a full
class (~33 students, WiFi with client isolation, so hotspot/LAN options don't fit).

**How:** stop using the Cloudflare tunnel and instead point the domain **straight
at the VM**, which serves its own Let's Encrypt certificate via Caddy. The
extension's baked-in URL (`https://proctor.jesoas.org`) then resolves to the VM's
real IP instead of Cloudflare's edge.

---

## 0. Go / No-Go test (do this FIRST, on AU WiFi)

This only works if AU blocks **Cloudflare's servers**, not your **domain**.

- Open **`https://www.cloudflare.com`** on AU WiFi.
  - **Also blocked / won't load →** AU blocks Cloudflare → **Option C will work. Proceed.**
  - **Loads fine →** the block is your domain specifically → Option C will NOT
    help (you'd need a different domain = a new extension version + Web Store
    review). Stop and reconsider.

Also grab your VM's **public IP** (Oracle console → your instance → Public IP, or
on the VM: `curl -s ifconfig.me`).

---

## 1. Open the VM firewall for 80 + 443 (both layers)

Oracle has **two** firewalls; open both.

**a) Oracle Security List (cloud console):**
Networking → your VCN → the subnet → Security Lists → default → **Add Ingress Rules**:
- Source `0.0.0.0/0`, IP Protocol TCP, Destination Port **80**
- Source `0.0.0.0/0`, IP Protocol TCP, Destination Port **443**

**b) The instance's iptables (on the VM):**
```bash
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save     # persist across reboots
```
If `netfilter-persistent` is missing: `sudo apt-get install -y iptables-persistent`
then re-run the save (or `sudo sh -c 'iptables-save > /etc/iptables/rules.v4'`).

---

## 2. Repoint the DNS (Cloudflare dashboard → DNS)

The `proctor` record is currently a **proxied CNAME** to the tunnel. Replace it
with a **DNS-only A record** to the VM so traffic goes straight to the VM.

1. **Delete** the existing `proctor` CNAME (the tunnel one → `*.cfargotunnel.com`).
2. **Add record:** Type **A**, Name `proctor`, IPv4 = **your VM's public IP**,
   Proxy status = **DNS only (grey cloud)**. Save.
3. Leave `jesoas.org` / `www` records untouched.

DNS-only is essential — if it stays proxied (orange), Cloudflare intercepts port
80 and Caddy can't get its certificate. Propagation is usually seconds–minutes.

Verify from your laptop: `nslookup proctor.jesoas.org` should now return the VM's IP.

---

## 3. Deploy the direct setup (on the VM)

```bash
cd ~/Proctor
git checkout main && git pull            # gets docker/Caddyfile + the caddy service

cd docker
docker compose down                      # stop the tunnel stack (keeps the DB volume)
docker compose --profile direct up -d --build
docker compose logs -f caddy             # watch it obtain the certificate
```
Wait for a Caddy log line like `certificate obtained successfully` for
`proctor.jesoas.org`. (`db` + `backend` start too; `cloudflared` does NOT — it's
in the "tunnel" profile, which we're not using.)

---

## 4. Verify

```bash
# on the VM (resolves its own domain -> its public IP -> Caddy)
curl https://proctor.jesoas.org/health          # {"status":"ok",...}
```
Then the real test: **from a student laptop on AU WiFi**, open
`https://proctor.jesoas.org/health` in a browser. If it loads, Option C worked and
the published extension will work for everyone. Do a full dry run (create exam →
join with the extension → see events) before the class.

---

## 5. Rollback (if it fails or after the test)

Put Cloudflare back in front:
1. Cloudflare DNS → delete the `proctor` **A** record.
2. Bring the tunnel back: `cd ~/Proctor/docker && docker compose down && docker compose --profile tunnel up -d --build`.
3. Zero Trust → Tunnels → `proctor` → Public Hostname → re-add `proctor.jesoas.org`
   → `HTTP` → `backend:3000` (this recreates the proxied CNAME).

---

## Troubleshooting

- **Caddy cert fails / ACME error:** confirm ports 80+443 are actually open
  (`curl http://proctor.jesoas.org` from your laptop should reach the VM), DNS is
  DNS-only and resolves to the VM, and no `CAA` record on `jesoas.org` blocks
  Let's Encrypt. Caddy retries automatically; watch `docker compose logs caddy`.
- **Works from the VM but not from AU WiFi:** then AU is blocking the **domain
  name** (SNI/DNS), not Cloudflare — Option C can't fix that (see step 0). Fall
  back to a hotspot for a smaller group.
- **Rate limits:** Let's Encrypt allows ~5 certs/domain/week. The `caddy_data`
  volume persists the cert across restarts, so don't delete it needlessly.
- **`docker compose down` note:** it removes containers but KEEPS named volumes
  (`postgres_data`, `caddy_data`), so exam data and the cert survive.

---

## Why this keeps the extension working

The extension is published with `DEFAULT_API_BASE = https://proctor.jesoas.org`.
After Option C, that hostname resolves (via Cloudflare DNS, DNS-only) to the VM's
own IP, and the VM serves a valid Let's Encrypt cert for it. So the extension's
existing HTTPS calls succeed — **no extension change, no re-review, no per-device
override.** The only bet is that AU blocks Cloudflare's IPs, not the domain (step 0).
