# LearnHub 单机部署文件

这些模板只用于 LearnHub，不修改机器人服务。目标为现有 2 CPU、约 1.68 GiB 内存的主机，应用只监听 `127.0.0.1:3002`，公网通过 HTTPS 反向代理访问。3001 保留给原服务。先检查真实运行情况和端口，不能把此模板当作已经完成部署的证明。

## 目录与权限

| 路径                                                         | 用途与权限                                                                  |
| ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `/srv/learnhub/releases/<版本>/`                             | 已构建的源码、dist 和生产依赖；root 管理，learnhub 可读，不可改             |
| `/srv/learnhub/current`                                      | 指向当前 release 的软链接，切换版本时保留旧 release 以便回滚                |
| `/opt/learnhub/node`                                         | 项目专用 Node.js 24+，root 管理；避免读取或改动机器人的私有运行目录         |
| `/srv/learnhub-data/files`                                   | `STORAGE_DIR`，learnhub 用户可写；迁移现有实际资源和原头像文件              |
| `/srv/learnhub-data/private`                                 | LearnHub 私有运行目录，learnhub 用户可写；每个 release 的 `.local` 链接至此 |
| `/etc/learnhub/learnhub.env`                                 | root:root 0600，systemd 读取后供应数据库和模型秘密                          |
| `/etc/learnhub/mysql-ca.pem`                                 | root:learnhub 0640，应用能读取的可信数据库 CA                               |
| `/etc/learnhub/tls/`                                         | HTTPS 证书和私钥，只供反向代理及证书续期服务读取                            |
| `/var/lib/learnhub-acme/webroot/.well-known/acme-challenge/` | HTTP 验证文件；与项目数据及秘密隔离                                         |

首次建立用户与目录前先确认同名用户和路径不存在冲突。不要运行 `db:init` 覆盖已有云数据；现有 LearnHub 数据库只执行已审阅的待应用迁移。上传目录与数据库必须配套备份，不把 `.avatar-cache` 当作必须恢复的原件。

在本机执行生产构建，服务器安装生产依赖，避免在机器人主机打包前端的内存峰值。使用锁文件，Linux 上安装目标平台的 sharp 预构建依赖，不能复制 Windows 的 node_modules。部署前验证 Node、系统库与 sharp 实际可加载。

## 服务与代理

`learnhub.service` 强制生产模式和本地 3002 监听。初始内存硬上限 384 MiB、堆上限 192 MiB、CPU 上限一核，并降低调度优先级；这些是保护现有服务的限制，不是并发承载保证。cgroup v1 主机可能不支持 MemoryHigh 软限制，应检查 systemd 日志，MemoryMax 硬限制和实际主机可用内存仍须核对。上线后观察 LearnHub 和机器人的内存、延迟、重启与 OOM，按实测调整，不能为消除重启直接取消限制。

应用的 `TRUST_PROXY` 默认仅信任 loopback。`off` 或 `false` 关闭信任；也可配置逗号分隔的明确 IP/CIDR。禁止布尔 true、跳数、通配符和 `/0`。此单机模板保持 `loopback`，Nginx 丢弃客户端原始 X-Forwarded-For，写入实际连接 IP。若今后增加云负载均衡或 CDN，先重新确认代理链，再精确配置可信地址。

`learnhub.nginx.conf` 的 `__PUBLIC_HOST__` 必须替换成最终域名或 IP。证书必须由浏览器信任、与地址匹配，并具备经过实际验证的自动续期；缺证书时先只启用审阅后的 HTTP ACME 验证站点，不加载不存在证书的 HTTPS 配置。不要使用自签证书绕过验证，不要关闭 Secure Cookie 或生产数据库加密保护。数据库仍需远程 TLS、可信 CA 或已审阅的受保护本地数据库通道。

文本启用 gzip，原图不重复压缩。聊天 SSE 与 AI NDJSON 关闭压缩、代理缓存和缓冲。静态资源缓存由应用的已测试规则提供，所有 API 不放入反代公共缓存。不要把仓库根目录或 `/srv/learnhub-data` 设置为 Nginx root。

替换配置并准备文件后，先检查配置语法与权限，再加载独立 `learnhub.service` 和代理配置。验证首页、生产 Cookie、真实登录、私聊、AI、上传下载及缓存，同时复查机器人健康。只回滚 LearnHub 的当前 release / 独立配置；不删除数据库、上传文件或机器人的目录。

本地无数据库测试：`node --test server/tests/proxy-config.test.mjs`。真实服务、证书、数据库和并发验证由部署执行记录单独提供。

## 本次实际采用 Caddy + IP HTTPS

现有 CentOS 8 主机未安装 Nginx，因此采用已核对官方 SHA256 的 Caddy 2.11.7 与 lego 5.5.2 单二进制，避免改动系统仓库或机器人。`learnhub.Caddyfile`、`learnhub-proxy.service`、`learnhub-cert.service`、`learnhub-cert.timer` 和 `learnhub-cert-reload.sh` 是实际部署使用的模板；`__PUBLIC_HOST__` 替换为公网 IP。`learnhub.nginx.conf` 保留为其他环境的可选方案。

先使用只提供 HTTP ACME 验证目录的临时代理配置，staging 验证成功后申请正式 `shortlived` IP 证书，再加载完整 HTTPS 配置。Caddy 只读取手动证书，不使用自签或修改系统信任。IP 位于云 NAT 后时需要 `default_sni`，普通 IP 客户端不一定提供 SNI。

证书任务由 root 运行。`/var/lib/learnhub-acme` 为 0711、`webroot` 为 0755，使非 root 代理能读取验证文件；账号和原证书私钥仍由 lego 以私有权限存储。部署钩子验证证书、IP 和密钥配对，复制为 `/etc/learnhub/tls/{fullchain,privkey}.pem`，root:learnhub-proxy 0640。验证失败保留或恢复旧证书，仅重载 LearnHub 代理。

定时器每六小时执行并随机延迟至多十分钟；因此关闭 lego 自身额外随机等待，避免超过 systemd 超时。初次签发和当前续期检查成功不等于已经经历真实到期续期。

普通响应启用 gzip。SSE 依赖 `text/event-stream` 原生即时刷新，AI 使用正值 100ms 刷新周期；不使用会改变客户端断开取消语义的负数周期。两类流均不压缩。实际公网六次 SSE 连接关闭、真实 AI 和重启恢复已验证，见[实际部署报告](../docs/server-deployment-2026-10-28.md)。
