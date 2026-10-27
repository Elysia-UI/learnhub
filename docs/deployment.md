# 启动与部署

## 本机

Node.js 24+，当前专用云连接已加密配置。

```powershell
cd /path/to/learnhub
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

替换示例域名主机路径。TLS 保持证书验证，不通过关闭校验绕过错误。本次实测原云连接尚未启用 TLS，未声称完成正式加密部署。

## 正式服务

production 模式下 Express 提供 dist、页面路由回退及 API。用 Nginx/Caddy 将 HTTPS 域名代理至 127.0.0.1:3001，保留 Host/Origin。Cookie 带 Secure，HTTP 下不能维持生产登录；APP_ORIGINS 填实际 HTTPS 来源。

以 systemd / 容器 / 既有进程管理器托管，工作目录为项目根目录，环境文件仅服务账号可读。STORAGE_DIR 与 .local 需要受保护持久存储。不得将 .env、.local、备份或整个项目目录作为静态公开目录。

Vite preview 只预览产物，不能替代后端，/api 也需要代理。日常验收用 npm start。

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

当前是本机前后端 + 真实云 MySQL，尚未发布应用至公网，也未完成生产 TLS、负载测试及备份恢复演练。

## 本轮升级和 AI 配置

已有数据环境先运行 `npm run db:migrate`，再运行 `node scripts/backfill-badges.mjs`，不清库。新环境 `npm run db:init` 会执行迁移和徽章补录。

AI_BASE_URL、AI_API_KEY、AI_MODEL 在服务端 `.env` 配置后重启，使用兼容 `/chat/completions` 的 SSE 服务，详见 [功能补齐记录](feature-implementation.md)。2026-10-28 当前本机已完成阶跃星辰 Step Plan / step-5-preview 的两轮真实联调；迁移到其他环境仍须单独供应密钥，详见 [接入记录](ai-stepfun-verification.md)。

生产启动会拒绝未启用 TLS 的远程数据库连接。当前云端握手返回 HANDSHAKE_NO_SSL_SUPPORT，需先配置云数据库 TLS 和可信 CA；不得通过关闭证书校验绕过。
