# 启动与部署

## 本机

Node.js 24+，当前专用云连接已加密配置。

```powershell
cd learnhub
npm ci
npm run db:init
npm start
```

启动前端 5173、API 3001 并打开浏览器。也可双击启动项目.cmd。仅绑定本机地址。分别运行可用 npm run dev 与 npm run dev:api。

Windows DPAPI 通过 Python 调用系统接口。DB_PYTHON 可指定 Python 路径；直接设置 DB_* 则读取连接不依赖 DPAPI，但 Windows 演示账号保存仍需要 Python。

## 新机器 / Linux

1. 用 server/provision.sql 创建独立 MySQL 8 库。
2. 数据库管理员建立独立账号，仅授权本库。迁移需要 CREATE/ALTER/INDEX/REFERENCES，业务需要 SELECT/INSERT/UPDATE/DELETE。
3. 复制 .env.example 为 .env 并填写服务端配置，不使用 VITE_* 存数据库秘密。
4. npm ci、npm run db:init、npm run build。
5. 设置 NODE_ENV=production，运行 npm run start:production。

DB_NAME 仅允许 learnhub 或 learnhub__。db:provision 是复用当前 Windows 已保存连接档案的一次性助手，其他环境直接提供 DB__。

```dotenv
API_HOST=127.0.0.1
API_PORT=3001
APP_ORIGINS=https://learnhub.example.com
DB_HOST=your-project-database-host
DB_PORT=3306
DB_NAME=learnhub
DB_USER=learnhub_app
DB_PASSWORD=replace-on-server-only
DB_SSL=true
DB_SSL_CA=/secure/path/mysql-ca.pem
STORAGE_DIR=/srv/learnhub-data/files
NODE_ENV=production
```

替换示例域名主机路径。TLS 保持证书验证，不通过关闭校验绕过错误。2026-10-28 已开启原云数据库 SSL，实际生产连接为 TLS 1.3，服务端证书身份限制见[部署记录](server-deployment-2026-10-28.md)。

## 正式服务

production 模式下 Express 提供 dist、页面路由回退及 API。用 Nginx/Caddy 将 HTTPS 域名代理至 127.0.0.1:3001，保留 Host/Origin。Cookie 带 Secure，HTTP 下不能维持生产登录；APP_ORIGINS 填实际 HTTPS 来源。

以 systemd / 容器 / 既有进程管理器托管，工作目录为项目根目录，环境文件仅服务账号可读。STORAGE_DIR 与 .local 需要受保护持久存储。不得将 .env、.local、备份或整个项目目录作为静态公开目录。

Vite preview 只预览产物，不能替代后端，/api 也需要代理。日常验收用 npm start。

## 低带宽静态资源传输

生产服务只公开 `dist` 目录。`dist/assets` 中带内容哈希的构建文件缓存一年并标记 `immutable`；公共 `dist/images` 图片缓存一天，过期后用 ETag / Last-Modified 验证。首页、页面路由回退和其他不带哈希的文件使用 `no-cache`，允许验证后复用，但不会长期保留旧页面入口。更换同名公共图片时应更新文件名或引用版本，保证已有访问者及时取得新图。

这些缓存规则在 API 路由之后挂载，不改变用户资料、登录会话、私聊、资源权限下载等业务接口的原有权限与缓存策略，不将私有文件目录暴露为静态文件。

用户上传头像继续使用原 `/api/uploads/avatar-*.png|jpg|jpeg|webp` URL 和数据库记录。明确发送 `Accept: image/webp` 且未设 `q=0` 的客户端，可取得更小的 320px WebP 副本；其他客户端取得原文件，响应均带 `Vary: Accept`，保留一小时缓存及对应文件的 ETag。原图不覆盖，副本存于 `STORAGE_DIR/.avatar-cache`，没有公开缓存目录路由。缓存可丢弃重建，备份以原上传文件为准。生产安装需要 `sharp` 依赖。

头像转换最多两项同时运行、最多等待十六项；同一原文件合并转换并按原文件名、大小与更新时间复用缓存。小于 32KiB、大于 2MiB、超过八百万像素、动画 WebP、解码失败或转换后反而更大的文件保持原图。队列已满时也返回原图，避免挤占小服务器内存。独立验证命令：`node --test server/tests/avatar-images.test.mjs`，不连接数据库。

小服务器优先在反向代理压缩文本响应，不在每次 Node 请求中压缩大文件。以下 Nginx 示例继承 Express 的缓存头，为 HTML / CSS / JS / JSON / SVG 启用 gzip；JPEG / PNG / WebP 已编码，不重复 gzip。好友聊天 SSE 与 AI 增量输出分别关闭压缩和缓冲，保证即时送达。本轮仅验证 Express 缓存行为，尚未在公网服务器安装或启动此 Nginx 配置。

```nginx
server {
    listen 80;
    server_name learnhub.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name learnhub.example.com;
    ssl_certificate     /etc/nginx/tls/learnhub.fullchain.pem;
    ssl_certificate_key /etc/nginx/tls/learnhub.key;

    client_max_body_size 12m;
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_comp_level 5;
    gzip_proxied any;
    gzip_types text/css application/javascript application/json image/svg+xml;

    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Connection "";

    location = /api/chat/events {
        gzip off;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 90s;
        proxy_pass http://127.0.0.1:3001;
    }

    # AI 返回 application/x-ndjson 增量内容，保持即时输出。
    location ^~ /api/ai/ {
        gzip off;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 180s;
        proxy_pass http://127.0.0.1:3001;
    }

    location /api/ {
        proxy_cache off;
        proxy_pass http://127.0.0.1:3001;
    }

    location / {
        proxy_pass http://127.0.0.1:3001;
    }
}
```

部署时替换域名、证书和后端端口。若原服务器 3001 已供机器人使用，LearnHub 设置 `API_PORT=3002`，同时将上述四处代理端口统一改为 3002。先执行 `nginx -t`，成功后再重载。不要增加把所有 `/api` 响应缓存或长期缓存 HTML 的规则。

独立缓存测试无需数据库：`node --test server/tests/static-assets.test.mjs`。公网验证可使用 `curl -I https://实际域名/` 检查 HTML 的 `Cache-Control: no-cache`，对真实 `/assets/文件名-哈希.js` 验证 `immutable`，用 `curl --compressed -I https://实际域名/assets/文件名-哈希.js` 检查代理的压缩响应头。

## 备份与迁移

- 备份 learnhub 数据库，同时备份 STORAGE_DIR 实际文件，验证恢复一致。
- 版本管理保留源代码、锁文件、迁移、种子及部署文档。
- Windows 加密连接不能跨机器直接复制；新主机重新供应秘密。
- 初始账号清单不随改密自动更新，禁止加入源码包或公开报告。
- 需要全新环境时另建 learnhub_* 库和单独账号，不清空已有业务库。

## 故障

| 现象           | 处理                                            |
| -------------- | ----------------------------------------------- |
| 尚未配置数据库 | 当前机器 db:provision，其他机器设置 DB_*        |
| DPAPI 读取失败 | 检查 Windows 用户和 DB_PYTHON，迁机重新供应配置 |
| 连接超时       | 检查云实例、端口、网络、允许来源                |
| Access denied  | 检查专用账号授权，勿输出完整密码配置            |
| 表不存在       | 执行 db:init / db:migrate                       |
| 页面加载失败   | 检查 /api/health 和后端，不能只启动 Vite        |
| 401 / 403      | 检查登录、Cookie、CSRF、Origin、服务端角色      |
| 生产登录丢失   | 使用 HTTPS，检查 Secure Cookie 与 Origin        |
| 文件不可用     | 恢复与数据库匹配的私有文件目录                  |

2026-10-28 已实际发布到 [公网 HTTPS 网站](https://192.0.2.10/)，使用独立 Caddy 反代、生产 Node 服务和原云 MySQL。已生成备份；完整负载测试及独立恢复演练尚未完成，见[部署记录](server-deployment-2026-10-28.md)。

## 本轮升级和 AI 配置

好友聊天升级同样先执行 `npm run db:migrate`。反向代理 `/api/chat/events` 关闭缓存和响应缓冲，使用 HTTP/1.1，保留 Cookie/Origin，读取超时大于 25 秒心跳间隔（例如 90 秒）。当前按单应用进程分发提示，多副本需要共享事件层；详见[好友聊天记录](friend-chat.md)。

已有数据环境先运行 `npm run db:migrate`，再运行 `node scripts/backfill-badges.mjs`，不清库。新环境 `npm run db:init` 会执行迁移和徽章补录。

AI_BASE_URL、AI_API_KEY、AI_MODEL 在服务端 `.env` 配置后重启，使用兼容 `/chat/completions` 的 SSE 服务，详见 [功能补齐记录](feature-implementation.md)。2026-10-28 当前本机已完成阶跃星辰 Step Plan / step-5-preview 的两轮真实联调；迁移到其他环境仍须单独供应密钥，详见 [接入记录](ai-stepfun-verification.md)。

生产启动会拒绝未启用 TLS 的远程数据库连接。原先 HANDSHAKE_NO_SSL_SUPPORT 的阻塞已通过腾讯云控制台开启 SSL 解决，使用腾讯云官方 CA 验证；不得通过关闭证书校验绕过。
