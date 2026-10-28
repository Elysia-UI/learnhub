# 腾讯云实际部署记录

日期：2026-10-28。已部署至原有 3Mbps 腾讯云服务器，未购买服务器、带宽或域名。

入口：[LearnHub 公网 HTTPS](https://192.0.2.10/)。使用原云数据库和现有账号，未初始化或覆盖真实业务库。

## 实际安装

- 服务器：2 vCPU，实测内存约 1.68GiB，CentOS Linux 8。
- 应用：独立 `learnhub` 用户、Node.js 24.22.1 单进程，仅监听 `127.0.0.1:3002`。
- 代理：独立 `learnhub-proxy` 用户、Caddy 2.11.7，公开 TCP 80/443。HTTP 跳转 HTTPS，ACME 验证路径单独处理；没有开放应用的 3002。使用 `default_sni` 处理公网 IP 经 NAT 且客户端不发送 SNI 的情况。
- 证书：lego 5.5.2、Let's Encrypt 浏览器受信 IP 证书。staging 验证后才正式签发，SAN 为 `192.0.2.10`。当前证书至北京时间 2026-11-04 11:15:26 有效；每六小时检查续期，定时器另有随机延迟。已验证首次签发及续期任务启动，尚未经历到期续期周期。
- 运行目录：`/srv/learnhub/current` 指向 `/srv/learnhub/releases/20261028-e7e4427`，基于本地构建并补充本轮部署配置。应用代码与安装依赖由 root 管理，服务账号只读。
- 数据：101 份现有实际文件复制至 `/srv/learnhub-data/files`；私有运行状态为 `/srv/learnhub-data/private`，不由网站静态公开。
- 秘密：`/etc/learnhub/learnhub.env` 为 root 0600；数据库密码和模型密钥经既有固定 SSH 主机指纹的加密连接供应，没有写入前端、仓库、公开报告或日志。
- 资源保护：Node 堆上限 192MiB、进程内存上限 384MiB、最多一个 CPU；Caddy 内存上限 128MiB、最多半个 CPU。使用较低调度优先级，前端在本地打包。
- 保留原机器人 3001 及其服务、容器和目录。部署后机器人容器仍运行，bridge/harness 均 active，未重启这些服务。未通过向真实联系人发送消息来测试机器人。

官方二进制归档 SHA256 已在本机及服务器校验：Caddy `727b91701a392de6ebc5027509f548bf39979e5216340d0faed8fa5e69c84f8b`，lego `2a35505089e7772c92e1e9ac144df91151ef2eca8568630db0ff91fca06d9bef`。

## 数据库与备份

经用户明确允许短暂重启后，在腾讯云控制台为现有 `example-database-instance` 开启 SSL。生产连接使用从该控制台下载的腾讯云官方 CA，保持 `rejectUnauthorized: true`，最低 TLS 1.2；实际会话为 **TLS 1.3 / TLS_AES_256_GCM_SHA384**。

证书限制需区分：CDB 服务端证书 CN 为 `TencentDB ROOT SERVER-CA`，没有 DNS SAN。额外开启严格 DNS 名称验证的探针报主机名不匹配，因此没有声明该项通过；现有 mysql2 生产配置采用官方 CA 链验证，未关闭 CA 验证。若未来要求证书绑定单实例域名，需要服务商提供匹配的 SAN 证书或另行审阅身份绑定方案。网站 HTTPS 使用另一张带公网 IP SAN 的受信证书，浏览器访问无需忽略安全警告。

在测试前生成一致性只读备份：39 张表、2,457 条记录。文件为 `/var/backups/learnhub/learnhub-2026-10-28T12-25-19-586Z.sql.gz`，目录 root 0700、文件 0600，不公开。脚本为 `scripts/backup-db.mjs`，不执行业务写入，保留旧零日期和大整数；备份仅用于新的空库恢复，不包含 DROP 或覆盖语句。恢复演练尚未执行。

## 实际公网验证

[结构化测试记录](deployment-verification-2026-10-28.json) 包含 14 项通过的基本验证：

- 受信 HTTPS、数据库健康、游客和普通用户管理权限。
- 注册、退出、重新登录、Secure/HttpOnly 会话。
- 发布、管理员审核、评论、重新读取、点赞、收藏。
- 两个临时用户互关、好友私聊、已读。
- 聊天事件流不压缩，连续六次连接并断开均正常，未因代理断开处理而耗尽每账号四条连接配额。
- 临时资源真实上传、审核、下载，内容完全一致。
- 服务器真实调用阶跃星辰，返回 `OK`；没有伪造回答或调用外部免费替代模型。
- JSON gzip 压缩，私有目录和秘密文件不能从网站读出。
- 实际重启 `learnhub.service` 后，原会话及测试帖子、评论、私聊仍从数据库重新读出。

测试结束清理了两名精确匹配虚拟邮箱的测试用户、临时帖子、对话、资源及实际文件，退出额外管理员会话。第一次清理误用了不存在的普通用户资源删除接口，触发外键保护；随后使用管理员资源删除接口完成清理，问题与解决过程保留在验证记录中。其他用户和真实内容未清理。

最终运行采样：应用约 56MiB、代理约 18MiB；没有后台压力测试，不能将采样值当作并发容量保证。

公网浏览器实际加载正常，可见图片没有损坏，未捕获控制台错误或警告；当前窗口没有横向溢出。[实际页面截图](screenshots/server-deployment-2026-10-28.png)。

## 维护与回滚

```sh
systemctl status learnhub learnhub-proxy learnhub-cert.timer
journalctl -u learnhub -n 50 --no-pager
systemctl restart learnhub
systemctl start learnhub-cert.service
```

数据库备份需要使用受保护的服务器环境供应配置，再运行 `npm run db:backup -- /var/backups/learnhub`；不要在 shell 中直接 source 环境文件或公开口令。

更新时上传独立 release，保留上个版本及私有文件，验证后切换 `current` 并重启 LearnHub。仅停止本次新增服务可使用 `systemctl stop learnhub learnhub-proxy learnhub-cert.timer`，不停止 Docker、机器人、数据库，不清空业务库或上传目录。

本次完成部署及基本流程，未宣称毕业设计已完整验收。长期公开发布的域名和备案、完整压力测试、独立恢复、安全与兼容性回归仍应按后续阶段处理。

控制台显示现有云数据库于北京时间 **2026-11-09 09:16:19** 到期、当前为手动续费。本次没有购买、续费或开启自动扣费；请在到期前自行安排，否则网站会受数据库停服影响。
