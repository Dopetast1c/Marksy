# Running Marksy at home

This guide takes you from an empty computer to Marksy running for your family every day: at home on your network, from anywhere over https, backed up every night, and easy to move to another computer later. You do not need to be a developer. You need a computer that stays on, Docker, and about an hour.

Everything runs in containers. The computer that runs them (the *host*) needs nothing but Docker: no Node.js, no database, no build tools. Every task in this guide is one command of the `marksy.sh` script (Linux, a Raspberry Pi, a Synology NAS) or `marksy.ps1` (Windows), run in the folder that holds the Marksy files.

## Contents

1. [What runs where](#1-what-runs-where)
2. [Choose a host](#2-choose-a-host)
3. [Install](#3-install)
4. [Host setup: Windows laptop](#4-host-setup-windows-laptop)
5. [Host setup: Raspberry Pi 3B](#5-host-setup-raspberry-pi-3b)
6. [Host setup: Synology NAS](#6-host-setup-synology-nas)
7. [Ways in on the home network](#7-ways-in-on-the-home-network)
8. [Router settings](#8-router-settings)
9. [Two addresses, one app](#9-two-addresses-one-app)
10. [Reaching your diary system](#10-reaching-your-diary-system)
11. [Outside the home: Cloudflare Tunnel and Access](#11-outside-the-home-cloudflare-tunnel-and-access)
12. [Security checklist](#12-security-checklist)
13. [Your family's first start](#13-your-familys-first-start)
14. [Backups](#14-backups)
15. [Restore and moving to another host](#15-restore-and-moving-to-another-host)
16. [Versions and updates](#16-versions-and-updates)
17. [Status and health](#17-status-and-health)
18. [Small hosts and memory](#18-small-hosts-and-memory)
19. [Secrets you must keep](#19-secrets-you-must-keep)
20. [If you also develop Marksy](#20-if-you-also-develop-marksy)
21. [Troubleshooting](#21-troubleshooting)

## 1. What runs where

```
 phone, laptop at home ──http──►  ┌──────────────── host ────────────────┐
                                  │  proxy ──► web (the app)             │
 phone anywhere ──https──► Cloudflare ──tunnel──► cloudflared ──► proxy │
                                  │  proxy ──► server (API, collector)   │
                                  │  server ──► postgres                 │
                                  │  backup ──► postgres, BACKUP_DIR     │
 GitHub release ──signed nudge──► │  updater ──► socket-guard ──► Docker │
                                  └──────────────────────────────────────┘
```

- **proxy**: the only part that listens on your network. It serves Marksy under one path (`/marksy` by default) and leaves the rest of the host's address free for other services later.
- **web**: the app itself, the same for every family and every path.
- **server**: the API and the collector, which reads your diary system during school days and never writes anything to it.
- **postgres**: the database, in a Docker volume of its own.
- **backup**: takes a backup every night and on demand, into a folder you choose.
- **updater**: installs new releases by itself, with a backup before and a rollback if anything goes wrong (section 16).
- **socket-guard**: the only container that can talk to Docker; it lets the updater touch Marksy's own containers and images and nothing else.
- **cloudflared**: optional, the encrypted tunnel to Cloudflare for access from outside. Nothing on your router has to be opened.

## 2. Choose a host

Any of these works, and you can move between them later without losing anything (section 15):

| Host | Good for | Notes |
|---|---|---|
| A Windows laptop or desktop with Docker Desktop | starting today | it must stay on and awake |
| A Raspberry Pi 3B or newer, 64-bit, with a USB SSD | a small, quiet, cheap host | 1 GB of memory is enough |
| A Synology NAS with Container Manager (x86_64) | a host that is on anyway | its own web server holds ports 80 and 443 |

The images are built for `linux/amd64` and `linux/arm64`.

## 3. Install

These steps are the same on every host. Do the host setup of your host (sections 4 to 6) first.

**1. Get the files.** Make a folder for Marksy (for example `C:\marksy`, `/home/pi/marksy` or `/volume1/docker/marksy`) and put these files from the repository into it: `docker-compose.prod.yml`, `docker-compose.macvlan.yml`, `marksy.sh`, `marksy.ps1`. You can clone the repository with git, or download them from the repository page. On Linux, make the script executable: `chmod +x marksy.sh`.

**2. Create the settings file.** This makes `.env.production` with fresh secrets. Until the first release is published, add `--channel preview`; leave it out afterwards.

```sh
./marksy.sh init-env --tz Europe/Vienna --channel preview
```
```powershell
.\marksy.ps1 init-env --tz Europe/Vienna --channel preview
```

Use your school's time zone. The command prints only the names of the keys it wrote. Open `.env.production` in a text editor and check these lines:

| Setting | What it is |
|---|---|
| `BASE_PATH` | the path of the app, `/marksy` by default; `/` serves it at the root |
| `BACKUP_DIR` | the folder for backups, outside the Marksy folder (`D:/marksy-backups`, `/mnt/ssd/marksy-backups`) |
| `PROXY_PORT` | the port on the host, `80` by default (section 7) |
| `TZ` | your school's time zone |

**3. Put the settings file in your password manager** now, before anything else (section 19).

**4. Start.**

```sh
./marksy.sh up
./marksy.sh status
```

The first start downloads the images and takes a few minutes; later starts take seconds. `status` shows the version, whether the server answers, the collector, the last sync and the last backup.

**5. Open the app** at `http://<host address>/marksy` from a computer on your network and connect your diary, or bring your data over from another computer (section 13).

To try Marksy without a diary account, `./marksy.sh seed` creates a fictional demo family (its logins and password are printed). Never do that on an instance anyone outside your home can reach.

## 4. Host setup: Windows laptop

- **Docker Desktop**: install it with the WSL 2 backend. In its settings, turn on *Start Docker Desktop when you sign in*. Docker Desktop starts when you sign in to Windows, so after a restart the laptop must be signed in (or set to sign in by itself) before Marksy is back.
- **Stay awake**: in *Settings, System, Power*, set sleep to *Never* when plugged in. In *Control Panel, Power Options, Choose what closing the lid does*, choose *Do nothing* when plugged in.
- **Firewall**: your home network must be a *Private* network in Windows. Then allow the proxy's port on private networks only, in PowerShell as administrator:

  ```powershell
  New-NetFirewallRule -DisplayName "Marksy" -Direction Inbound -Protocol TCP -LocalPort 80 -Profile Private -Action Allow
  ```

- **Backups**: a folder on another drive if you have one, for example `BACKUP_DIR=D:/marksy-backups`.
- **When the laptop was off**: Marksy catches up on its own when it is back: the collector reads the days it missed, and a backup missed at night is taken a few minutes after the start.

## 5. Host setup: Raspberry Pi 3B

- **System**: with Raspberry Pi Imager, write *Raspberry Pi OS Lite (64-bit)*, and in its settings turn on SSH, set a user and the host name.
- **Run from a USB SSD**: an SD card wears out under a database. On a Pi 3B, enable USB boot once: boot from the SD card, add `program_usb_boot_mode=1` to `/boot/firmware/config.txt`, reboot, and check that `vcgencmd otp_dump | grep 17:` prints `17:3020000a`. Then write the same system to the SSD, remove the SD card and boot from the SSD.
- **Swap**: give it compressed memory so a moment of high use does not stop a container:

  ```sh
  sudo apt install -y zram-tools
  echo -e "ALGO=zstd\nPERCENT=50" | sudo tee /etc/default/zramswap
  sudo systemctl restart zramswap
  ```

- **Power**: use a 5 V, 2.5 A supply. Check for undervoltage after a few days of running: `vcgencmd get_throttled` must print `throttled=0x0`.
- **Docker**:

  ```sh
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER
  ```

  Sign out and in again.
- **Backups**: a folder owned by the containers' user (id 1000):

  ```sh
  sudo mkdir -p /mnt/ssd/marksy-backups
  sudo chown 1000:1000 /mnt/ssd/marksy-backups
  ```

  The SSD is the Pi's only disk, so keep a second copy elsewhere (section 14).

## 6. Host setup: Synology NAS

- **Container Manager**: install it from the Package Center (DSM 7.2).
- **SSH**: turn it on in *Control Panel, Terminal & SNMP*. The commands of this guide run over SSH as an administrator (`sudo -i`), in the Marksy folder, for example `/volume1/docker/marksy`. Container Manager then shows the project and its containers.
- **Backups**: create a shared folder `marksy-backups` in *Control Panel, Shared Folder*, then give the containers' user access over SSH: `chown 1000:1000 /volume1/marksy-backups`. Set `BACKUP_DIR=/volume1/marksy-backups`.
- **Ports**: DSM's own web server holds ports 80 and 443. Use option B (recommended) or C or D of section 7.

## 7. Ways in on the home network

All of these are settings in `.env.production` and a restart (`./marksy.sh up`); nothing else changes.

**A. A path on the host's own address (default).** `http://<host address>/marksy`. `PROXY_PORT=80`. For the laptop and the Pi.

**B. A path on an address of its own (Synology, recommended there).** The proxy gets its own address on your network through a Docker *macvlan* network, for example `http://192.168.1.11/marksy`. Set:

```
MACVLAN_ADDRESS=192.168.1.11
MACVLAN_SUBNET=192.168.1.0/24
MACVLAN_GATEWAY=192.168.1.1
MACVLAN_PARENT=eth0
PROXY_PORT=8088
```

- Pick an address outside the range your router hands out by DHCP, and reserve it in the router (section 8).
- `MACVLAN_PARENT` is the host's network card: `eth0` on most Linux hosts, `ovs_eth0` on a Synology with Open vSwitch (see `ip link`).
- The scripts add `docker-compose.macvlan.yml` by themselves when `MACVLAN_ADDRESS` is set.
- The host itself cannot reach a macvlan address. Other devices can. If the host must reach it too, add a small bridge on the host (replace the addresses with yours; `192.168.1.12` is another free address):

  ```sh
  sudo ip link add marksy-shim link eth0 type macvlan mode bridge
  sudo ip addr add 192.168.1.12/32 dev marksy-shim
  sudo ip link set marksy-shim up
  sudo ip route add 192.168.1.11/32 dev marksy-shim
  ```

  These lines do not survive a restart: on a Synology, add them as a *Triggered task* at boot in the Task Scheduler; on Linux, as a systemd unit.

**C. A path on another port.** `http://<host address>:8088/marksy` with `PROXY_PORT=8088`. The simplest fallback when port 80 is taken.

**D. A local name without a path, through the Synology's reverse proxy.** `http://marksy.lan`. In DSM, *Control Panel, Login Portal, Advanced, Reverse Proxy*, add a rule from `http://marksy.lan:80` to `http://localhost:8088`, with `PROXY_PORT=8088`. Choose `BASE_PATH=/` to open the app at the name itself, or keep `/marksy`. Set `PROXY_TRUSTED_EXTRA` to the NAS's own address so the proxy believes DSM's forwarded headers, and `PROXY_HOST=marksy.lan`. Your router (or a local DNS server) must resolve `marksy.lan` to the NAS.

**E. Not recommended: a location in DSM's own web server.** You can add a `location /marksy` to DSM's nginx configuration by hand. Synology does not support that, and a DSM update can remove it without warning. Use B, C or D.

## 8. Router settings

- **A fixed address for the host**: a DHCP reservation for the host's network card, so its address never changes. With option B, also keep the macvlan address free (outside the DHCP range, or reserved).
- **A local name** (optional): if your router has local DNS, give the host or the macvlan address a name, such as `marksy.lan`.
- **No port forwarding.** Do not forward any port to the host, and turn off UPnP if you do not need it. The tunnel of section 11 needs no open port. Marksy refuses plain http from addresses outside your home network anyway, so a forwarded port by mistake never shows a login form to the internet.

## 9. Two addresses, one app

At home you open `http://<host address>/marksy`; outside you open `https://<your subdomain>/marksy`. It is the same Marksy with the same data, but **your browser sees two different sites**:

- you sign in separately at each address;
- the app is installed separately for each address;
- notifications are set up separately for each address.

Installing the app on a phone and receiving notifications need https, so **install the app on phones from the Cloudflare address**, and use it there at home too. Keep the home address for computers, and for the times the internet is down.

*Optional: one https address at home too.* With a local DNS server (AdGuard Home on a Raspberry Pi, or DNS Server on a Synology) you can make your subdomain resolve to the host inside your home. That only works with a valid certificate on the host for that name, which needs a proxy that obtains certificates through Cloudflare's DNS. The standard images do not do that; it is an advanced setup, and the tunnel works without it.

## 10. Reaching your diary system

The server reads your diary system over the internet from the host. Some diary systems accept requests only from certain countries or refuse connections that come through a VPN; the provider of your diary system says so in its settings. To check the connection without logging in:

```sh
./marksy.sh check-network
```

It prints the diary system's host and whether it can be reached (a name lookup and a connection, nothing is sent). If the host runs a VPN client, route that one host around the VPN (a *split tunnel*). With OpenVPN, add to the client configuration, replacing the host with the one `check-network` printed:

```
route <diary host> 255.255.255.255 net_gateway
```

## 11. Outside the home: Cloudflare Tunnel and Access

You need a domain on Cloudflare (a free plan is enough). The tunnel connects the host to Cloudflare from the inside; Cloudflare Access asks for an e-mail code before anyone even sees the login page. Turn the tunnel on **only after your family exists on the instance** (section 13): until then, anyone who reaches the address could create the first family.

1. **Create the tunnel.** In the Cloudflare dashboard, *Zero Trust, Networks, Tunnels, Create a tunnel*, type *Cloudflared*. Name it, and copy the token from the install command it shows (the long string after `--token`). Put it into `.env.production` as `TUNNEL_TOKEN=`.
2. **Route your subdomain to the proxy.** In the tunnel, *Public hostname*: your subdomain and domain, path empty, service type `HTTP`, URL `proxy:8080`.
3. **Protect the app with Access.** *Zero Trust, Access, Applications, Add an application, Self-hosted*. Domain: your subdomain; path: `marksy` (your `BASE_PATH` without the slash). Add a policy *Allow* with the e-mail addresses of your family; the login method *One-time PIN*. Marksy's own login still applies behind it.
4. **Keep the update hook reachable.** Add a second self-hosted application for the same subdomain with the path `_marksy/update-hook` and a policy *Bypass* for *Everyone*. The release workflow calls this path, and it accepts only signed requests.
5. **Go through the security checklist** (section 12).
6. **Turn the tunnel on:**

   ```sh
   ./marksy.sh tunnel on
   ```

Open `https://<your subdomain>/marksy` on your phone: Cloudflare asks for your e-mail and a code, then Marksy shows its login.

## 12. Security checklist

Before the tunnel goes on, check each line. Most are covered by Marksy's tests; the ones that depend on your setup are marked *you*.

- [ ] Session cookies are `HttpOnly` and `SameSite=Lax`, `Secure` over https, and carry the app's path.
- [ ] Logins, connecting a diary and invite codes are rate-limited per address and per login.
- [ ] Swagger (`/api/docs`) and the API document need a session in production (`API_DOCS=session`).
- [ ] Nothing answers without a session except the login, invites, health and the signed update hook; health shows only the version.
- [ ] Every page carries security headers and a content security policy that allows nothing from other sites.
- [ ] Plain http is answered only from your home network.
- [ ] Signing up without an invite works only on an empty instance (`SIGNUP=first`).
- [ ] Only signed releases install; the update hook takes nothing from the request but "check now".
- [ ] Only the socket guard sees the Docker socket, and it lets through Marksy's own containers and images only.
- [ ] *You:* no port of the router is forwarded to the host (section 8).
- [ ] *You:* Cloudflare Access protects `BASE_PATH`, and only the update hook bypasses it (section 11).
- [ ] *You:* `.env.production` is in your password manager, and nowhere public (section 19).

## 13. Your family's first start

There are two ways to start, and both end with your family in the app and the collector running.

**A new start.** Open the app on your network, choose *Connect a diary*, sign in with your diary account and create your Marksy login. The first family on an instance can do that without an invite; everyone after joins by invite. Or, from the command line (the values never appear in the output):

```sh
DIARY_LOGIN=… DIARY_PASSWORD=… MARKSY_DEV_EMAIL=… MARKSY_DEV_PASSWORD=… ./marksy.sh connect
```

**From a development database** (if you ran Marksy from the source code before and want to keep the history it collected):

1. On the development computer, export the database and its pictures into a folder outside the repository, and create the production settings with the same credentials key:

   ```sh
   pnpm db:export --out D:/marksy-transfer
   pnpm env:prod --out D:/marksy-secrets/.env.production --credentials-key-from .env --tz Europe/Vienna --channel preview
   ```

   The same key keeps the stored diary passwords readable.
2. **Move the two by different routes.** Put `.env.production` into your password manager and take it from there on the host. Move the export folder by a cable, a network share or a USB stick. Never put both into one folder on one stick.
3. On the host, put `.env.production` into the Marksy folder, copy the export into `BACKUP_DIR` (for example `BACKUP_DIR/import/`), start, and restore without the demo families:

   ```sh
   ./marksy.sh up
   ./marksy.sh restore import/<name>.dump --without-demo
   ```

4. Sign in. A restore ends every session and leaves the collector off; when you are sure no other computer reads the same diary account, turn it on:

   ```sh
   ./marksy.sh sync enable
   ```

5. Delete the transfer folder on both computers.

**Invite your family.** In the app, *More, Family, Invite*: choose the role and the children, and send the link. The person opens it, ideally on the Cloudflare address on a phone (section 9), and creates their login.

## 14. Backups

The backup service takes:

- **a daily backup** at `BACKUP_TIME` (03:30 by default, the host's `TZ`); a day missed while the host was off is taken a few minutes after it starts;
- **a backup on demand**: `./marksy.sh backup`;
- **a backup before every update** (with the automatic updates), named with the versions it went from and to.

Each backup is three files in `BACKUP_DIR`: the database (`.dump`), the uploaded pictures (`.uploads.tar.gz`) and a manifest (`.json`) with the version, the number of rows in every table and checksums. A restore checks all of them.

Kept: the newest of each of the last 7 days, 4 weeks and 6 months, and the last 10 backups taken before updates. Older ones are removed by themselves.

**Keep a second copy off the host.** A backup on the same disk does not survive the disk. Copy `BACKUP_DIR` regularly to another device or to cloud storage you trust: a scheduled copy to a NAS share, Synology Hyper Backup, or a second USB disk you swap now and then. Keep `.env.production` next to it in your password manager: a backup is useless without the key that reads its diary passwords.

## 15. Restore and moving to another host

A restore goes into an empty database (or one with no family yet, as a fresh start leaves it), checks the files against their manifest, brings the database up to the running version, ends every session and leaves the collector off. An older backup always comes up to the current version.

```sh
./marksy.sh restore daily/<name>.dump
./marksy.sh sync enable
```

`restore` stops the server and the backup service, restores, and starts everything again. To replace a database that has data (the last resort after something went badly wrong), add `--replace --yes`.

**Moving to another host**, step by step:

1. On the old host: stop the collector so it reads nothing more: `./marksy.sh sync disable`.
2. Take a final backup: `./marksy.sh backup`.
3. Stop the old host's stack: `./marksy.sh stop`.
4. Copy that backup (its three files) to the new host by a cable, a share or a USB stick, and take `.env.production` from your password manager.
5. Set up the new host (sections 3 to 6) with that `.env.production`, adjusting `BACKUP_DIR`, `PROXY_PORT` and the macvlan settings for the new host.
6. Start it and restore: `./marksy.sh up`, then `./marksy.sh restore import/<name>.dump`.
7. Check the app, then turn the collector on: `./marksy.sh sync enable`.
8. Move the tunnel: the same `TUNNEL_TOKEN` in `.env.production` and `./marksy.sh tunnel on` on the new host.
9. Update the router's DHCP reservation (and the local name) for the new host.
10. Keep the old host stopped, with its data, for a week. Then remove it.

## 16. Versions and updates

Marksy's versions are `MAJOR.MINOR.PATCH`:

- **MAJOR**: a global rework of the app; rare.
- **MINOR**: new features: 1.1.0, 1.2.0.
- **PATCH**: corrections and fixes: 1.1.1, 1.1.2.

Each release is published as images with the version and the lines it belongs to: `1.4.2`, `1.4`, `1`, `stable`, and signed by this project's release workflow on GitHub.

### Channels

`UPDATE_CHANNEL` in `.env.production` is the line your host follows. It is also the tag of the images the host runs, so a manual `./marksy.sh up` never moves away from what the updater installed.

| `UPDATE_CHANNEL` | Installs | Use it when |
|---|---|---|
| `1` (default) | every new 1.x release, features and fixes, never 2.0 | almost always |
| `1.4` | only fixes of 1.4: 1.4.1, 1.4.2 | you want no new features for a while |
| `1.4.2` | nothing: the host stays on 1.4.2 | you update only by hand |
| `stable` | every release, a new major version too | you accept larger changes without asking |
| `edge` | every build of the main branch | testing only; not for your family's data |

A host never goes to a lower version by itself. To change the channel, edit the line in `.env.production` and run `./marksy.sh up`.

### How an update happens

The updater learns about a release in two ways: the release workflow sends a signed nudge to `/_marksy/update-hook` the moment a release is published (the update then starts within a minute or two), and every 5 minutes, a little later on each host, it asks the registry anyway. Asking costs a few small requests; nothing is downloaded until there is something new.

Then, in this order, and nothing stops before everything is ready:

1. It checks the signature of every image with cosign: the image must be signed by this project's release workflow. An image without that signature is refused, and nothing is downloaded.
2. Inside quiet hours (`UPDATE_QUIET_HOURS`, e.g. `22:00-07:00`; empty by default) it waits until they end.
3. It asks the server not to start a new diary read, and waits for a running one to finish.
4. It checks the free disk space and takes a backup (section 14), named with both versions.
5. It downloads the new images by their digest.
6. It replaces the server, waits until it is healthy and reports the new version, then the backup service, the web app and, when its configuration changed, the proxy.
7. If any of them does not become healthy, it puts every old container back, and the previous version runs as before. A release that was rolled back is not tried again by itself.
8. It removes old images, but keeps the previous release for a quick way back, and finally replaces itself.

The server applies database changes when it starts, all in one transaction: if one fails, nothing changes, the server stops, and step 7 puts the previous version back on the unchanged database. Database changes are always made so that the previous version still works on them, which is what makes that way back safe.

While the server restarts (a few seconds; longer when the database changes), the proxy holds requests for up to 30 seconds, and an open app keeps showing what it has. When the new version runs, the app offers to reload and names the version.

### Commands

```sh
./marksy.sh update status          # channel, the last check, what is available, memory of every container
./marksy.sh update history 20      # the last attempts: from, to, outcome, backup, downtime
./marksy.sh update pause           # no automatic update until resume
./marksy.sh update resume
./marksy.sh update now             # check and install now, quiet hours or not
./marksy.sh update now --to 1.4.2  # install exactly this release (never a lower one)
```

`UPDATE_PAUSED=true` in `.env.production` pauses as well; a manual `update now` works in both cases. Other settings, all optional: `UPDATE_POLL_MINUTES` (5), `UPDATE_HEALTH_TIMEOUT_SECONDS` (300; raise it on a slow host), `UPDATE_COLLECTOR_WAIT_MINUTES` (20), `UPDATE_MIN_FREE_MB` (1024).

### The update hook

The nudge is a `POST` with an HMAC-SHA256 signature over a timestamp and the body, made with `UPDATE_HOOK_SECRET`. The updater accepts it only when the signature is right, the timestamp is within 5 minutes of the host's clock, and the same signature has not been seen; a few a minute at most. It only means "check now": the updater never takes a version or an image from it. Without the hook, updates still arrive by polling, at most a few minutes later.

To set it up, print the secret once and put it, with the address, into the repository's secrets on GitHub (`MARKSY_UPDATE_HOOK_SECRET` and `MARKSY_UPDATE_HOOK_URL`, e.g. `https://<your subdomain>/_marksy/update-hook`):

```sh
./marksy.sh init-env --show-hook-secret
```

The hook path is outside `BASE_PATH` and outside Cloudflare Access (section 11, step 4).

**Without a tunnel** the hook cannot reach the host, and that is fine: the host learns about every release by polling, within about 5 minutes. Leave the two GitHub secrets unset until the tunnel exists. Until then, the release workflow ends with the warning that the nudge did not go through; it is expected, and the release itself is complete.

### Going back to an earlier release

Every update leaves a backup taken just before it in `BACKUP_DIR/pre-update/`. To return to the release before an update:

1. `./marksy.sh update pause`
2. Set `UPDATE_CHANNEL` to that exact version (e.g. `1.4.1`) and run `./marksy.sh pull`, then `./marksy.sh up`. The previous release's images are usually still on the host.
3. Only if the newer release changed data the older one cannot read (the history says so under migrations), restore its pre-update backup: `./marksy.sh restore pre-update/<name>.dump --replace --yes`. Everything entered since that backup is lost.
4. Set the channel back and `./marksy.sh update resume` when a fixed release is out.

### Updating by hand

With a pinned channel, or when the updater is stopped:

```sh
./marksy.sh pull
./marksy.sh up
```

Take a backup first (`./marksy.sh backup`). The socket guard is updated this way too: the updater replaces every other container, and the guard follows the next time you run `up`.

## 17. Status and health

```sh
./marksy.sh status
```

shows the containers, the running version and commit, whether the server answers, the collector (on, off on this instance, runs in progress), the last successful sync, the last backup and its file, the number of backups and the free space on their disk, background data changes still running after an update, and the updater: its channel, the last check, a release waiting, the last attempts and the memory of every container. `./marksy.sh logs` shows the last lines of every container (`./marksy.sh logs server` for one). Logs never contain passwords, tokens or names.

`/marksy/api/health` answers with the version and whether the database answers, nothing else; Docker checks every container's health by itself and restarts what stops.

## 18. Small hosts and memory

The stack runs on a 1 GB Raspberry Pi. Each container has a memory limit in `docker-compose.prod.yml` (PostgreSQL 256 MB, server 320 MB, backup 128 MB, updater 128 MB, web and proxy 48 MB each, socket guard 64 MB, cloudflared 96 MB), and the server's memory and connection pools are capped.

Measured with the demo family, idle after opening every screen, on a test laptop: PostgreSQL 53 MB, server 78 MB, backup 43 MB, web 18 MB, proxy 17 MB, about 210 MB in all.

PostgreSQL's memory comes from `.env.production`. The defaults are the small profile for 1 GB. On a laptop or a NAS with memory to spare you can use the large one:

| Setting | Small (default) | Large |
|---|---|---|
| `PG_SHARED_BUFFERS` | `64MB` | `256MB` |
| `PG_EFFECTIVE_CACHE_SIZE` | `256MB` | `1GB` |
| `PG_WORK_MEM` | `2MB` | `8MB` |
| `PG_MAINTENANCE_WORK_MEM` | `32MB` | `128MB` |
| `PG_MAX_CONNECTIONS` | `30` | `50` |

With the large profile, raise the `mem_limit` of `postgres` in `docker-compose.prod.yml` to `768m`.

## 19. Secrets you must keep

`.env.production` holds the keys of your instance. Keep it in your password manager, next to your backups:

- **`CREDENTIALS_KEY`** encrypts the diary passwords stored in the database. **If you lose it, the stored diary passwords cannot be read**: the collector stops, and every diary must be connected again with its password. A backup restored with another key has the same problem.
- `SESSION_SECRET`, `POSTGRES_PASSWORD`, `MARKSY_INTERNAL_TOKEN`, `UPDATE_HOOK_SECRET`, `VAPID_*` and `TUNNEL_TOKEN` can be replaced, at the cost of signing everyone out, connecting the tunnel again or setting the update hook again.

`init-env` never replaces a value that is set, so running it again after an update only adds new keys.

## 20. If you also develop Marksy

If you run Marksy from the source code on another computer with the same diary account, the two installations do not know about each other's logins to the diary system. Once production runs, mark that in the development `.env`:

```sh
pnpm env:dev --production-active
```

Then the manual runs against the real diary from the development computer (`pnpm probe`, `pnpm sync:once`, `pnpm dev:connect`) keep the production limits: the diary system's login interval, at most three runs a day, only in the daytime. Keep them rare, and keep the development collector off (`SYNC_ENABLED=false` in the development `.env`), so only production reads the diary every day.

## 21. Troubleshooting

| You see | Do this |
|---|---|
| `status` says the server is not answering | `./marksy.sh logs server`; a database change that failed says so in the first lines, and the previous version of the images still works |
| The app says there is no connection | the server is restarting or the host is off; it comes back by itself |
| A page *Marksy is updating* | the proxy waited 30 seconds for the app; it reloads by itself |
| The collector is off after a restore | intended: `./marksy.sh sync enable` once no other host reads the diary |
| `check-network` says the diary host is not reachable | check the internet connection and a VPN on the host (section 10) |
| The phone shows a certificate warning | use the Cloudflare address for the phone (section 9) |
| A backup fails | `./marksy.sh status` shows when; check the free space and the owner of `BACKUP_DIR` (id 1000) |
| A release is out but not installed | `./marksy.sh update status`: paused, quiet hours, a diary read still running, a refused signature, or a release rolled back before (`update history`) |
| `update history` says *rolled_back* | the new release did not start; the previous one runs. `./marksy.sh logs server` shows why; a fixed release installs by itself |
| `update history` says *refused_signature* | the image was not signed by this project's release workflow; nothing was installed. Report it as an issue |
| The updater says the free space is too low | remove old backups you copied elsewhere, or `docker image prune` |
