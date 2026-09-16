<p align="center">
  <img src="doc/demo/logo.png" width="80" alt="PureMail 标志" />
</p>

<h1 align="center">PureMail</h1>

<p align="center">基于 Cloudflare Workers 的自托管邮箱，提供 Win95 复古桌面与现代邮件工作区。</p>

<p align="center">
  简体中文 | <a href="README-en.md">English</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License" /></a>
  <a href="https://github.com/puremixai/puremail/issues"><img src="https://img.shields.io/github/issues/puremixai/puremail" alt="Issues" /></a>
  <a href="https://github.com/puremixai/puremail/stargazers"><img src="https://img.shields.io/github/stars/puremixai/puremail" alt="Stars" /></a>
</p>

## 项目来源

**PureMail 是基于 [maillab/cloud-mail](https://github.com/maillab/cloud-mail)（Cloud Mail）修改的衍生项目**，在上游的邮箱收发、用户管理和 Cloudflare 部署能力之上，持续改进界面、社区登录、邮件隐私与收发可靠性。感谢原作者和上游贡献者。

- 本项目仓库：[puremixai/puremail](https://github.com/puremixai/puremail)
- 本项目反馈：[Issues](https://github.com/puremixai/puremail/issues)
- 上游部署参考：[Cloud Mail 文档](https://doc.skymail.ink)；本分支的配置和功能以当前代码及下文为准。

上游的演示站、社区和赞助渠道由上游维护，不代表本项目的部署或维护入口。本仓库保留上游 MIT 许可证与原始版权声明。

## 功能与改进

### 本分支的主要改进

- **三种主题**：默认 Win95 复古桌面，支持切换现代浅色和深色主题；包含开始菜单、任务栏、桌面窗口和响应式布局。
- **身份卡与学生证页面**：可拖动、翻面的身份卡，支持邮箱复制、完整地址查看、位置记忆和移动端展示。
- **邮件工作区**：宽屏列表与正文并排阅读，可调整列表宽度；支持连续阅读、地址栏恢复当前邮件、紧凑／舒适密度和键盘快捷键。
- **搜索与写信体验**：按发件人名称、地址和主题搜索当前邮箱；支持多收件人粘贴、地址校验，以及按用户和邮箱隔离的本机草稿保存与恢复。
- **社区登录**：支持 Linux DO、GitHub、Google，并新增 XAI Connect OIDC 登录；当前 Linux DO 和 XAI 新用户绑定邮箱可免注册码。
- **邮件隐私**：HTML 邮件内容清洗、外部图片按需加载、附件访问校验，以及退出登录和切换账号时的会话数据清理。
- **收发可靠性**：发送请求去重、配额预留、接收去重与恢复、附件清理重试；不确定是否已投递的发送保留状态供管理员核对，不会自动重发。提供数据库升级脚本和回归测试。

### 邮箱基础能力

- 自定义域名、多邮箱账号、收件箱、星标、已发送和联系人管理。
- 通过 Cloudflare Email Routing 接收邮件，通过 Resend 或配置的 Cloudflare `send_email` 绑定发送邮件，支持站内投递、附件和内嵌图片。
- 使用 R2 或兼容 S3 的对象存储保存附件，未配置时回退到 KV；支持邮件转发和 Telegram 推送。
- 用户与邮件管理、RBAC 角色权限、注册码、域名和资源使用限制。
- 开放 API、Workers AI 验证码识别、ECharts 数据统计、Turnstile 验证及站点个性化设置。

实际可用功能取决于管理员配置、角色权限和所绑定的服务。本机草稿不会跨设备同步；当前搜索范围为发件人和主题，不包含邮件正文全文检索。

## 界面预览

以下为本分支的本地预览截图，使用合成邮箱和邮件数据。

部分截图制作于 PureMail 更名前，画面中的旧项目名称仅作为历史界面记录保留。

| Win95 邮件工作区 | 现代浅色主题 |
| --- | --- |
| ![Win95 邮件阅读](docs/product-design-2026-09-06/reading-win95-desktop.png) | ![现代浅色邮件阅读](docs/product-design-2026-09-06/reading-light-desktop.png) |
| **现代深色主题** | **身份卡** |
| ![现代深色邮件阅读](docs/product-design-2026-09-06/reading-dark-desktop.png) | ![身份卡正面](docs/idcard-ui-2026-09-06/front.png) |

更多截图和交互说明见[邮件工作区说明](docs/product-design-2026-09-06/README.md)与[身份卡说明](docs/idcard-ui-2026-09-06/README.md)。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | Vue 3、Vite、Element Plus、Pinia、Vue Router、TinyMCE |
| 后端 | Cloudflare Workers、Hono、Drizzle ORM |
| 数据与文件 | Cloudflare D1、KV、R2／兼容 S3 的对象存储 |
| 邮件与可选服务 | Cloudflare Email Routing、Resend、Workers AI、Turnstile |
| 测试与部署 | Vitest、Wrangler、GitHub Actions |

正式构建默认将前端输出到 `mail-worker/dist`，由同一个 Worker 提供页面、`/api` 接口及附件访问。

## 本地开发

当前 CI 使用 **Node.js 24 和 pnpm 11**，本地可使用相同版本。以下命令在仓库根目录执行，适用于 PowerShell。

```powershell
git clone https://github.com/puremixai/puremail.git
cd puremail
pnpm --dir mail-worker install --frozen-lockfile
pnpm --dir mail-vue install --frozen-lockfile
```

### 仅预览前端

```powershell
pnpm --dir mail-vue dev
```

打开 [Win95 设计预览](http://localhost:3001/design-preview.html?theme=win95#/inbox?message=999)，也可将 `theme` 改为 `light` 或 `dark`。此入口使用本地模拟 API，无需启动 Worker；发送和删除仅修改预览内存，刷新后重置。该入口不包含在正式构建中。

### 前后端联调

1. 检查 `mail-worker/wrangler-dev.toml`，设置开发环境的 `domain`、`admin`、`jwt_secret` 和资源绑定。文件中的现有值不应直接用作生产配置；连接自己的 Cloudflare 资源时，替换 D1、KV 等资源标识。
2. 先构建前端，生成 Worker 配置所需的静态资源目录，再启动本地 Worker：

   ```powershell
   pnpm --dir mail-vue build
   pnpm --dir mail-worker dev
   ```

3. Worker 启动后，在另一个终端初始化本地数据库，将占位符替换为开发配置中的值：

   ```powershell
   Invoke-RestMethod 'http://127.0.0.1:8787/api/init/<jwt_secret>'
   ```

   返回 `success` 表示初始化完成。初始化入口包含密钥，不要分享完整地址。

4. 运行 `pnpm --dir mail-vue dev`，打开 [本地前端](http://localhost:3001)。`.env.dev` 默认请求 `http://127.0.0.1:8787/api`；需要覆盖时可使用 `mail-vue/.env.dev.local`。

本地联调使用 Wrangler 的本地资源；真实邮件接收、发送、对象存储和 OAuth 需要另行配置相应服务。

连接远程部署时，在 `mail-vue/.env.remote.local` 中设置 `VITE_BASE_URL=https://<你的站点域名>/api`，再运行 `pnpm --dir mail-vue remote`。仓库中的远程地址为示例占位符。

### 测试与构建

```powershell
pnpm --dir mail-worker test:unit
pnpm --dir mail-vue test:unit
pnpm --dir mail-vue build
```

## 部署到 Cloudflare

需要 Cloudflare 账号、用于邮件的域名、D1 数据库和 KV 命名空间。附件存储、邮件发送、验证码识别和人机验证按需配置。

### GitHub Actions

仓库提供 [部署工作流](.github/workflows/deploy-cloudflare.yml)。Fork 后，在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 配置以下项目；敏感值使用 Secrets。

| 配置项 | 必填 | 说明 |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | 是 | 用于部署 Worker 和访问所需 Cloudflare 资源的 API Token |
| `CLOUDFLARE_ACCOUNT_ID` | 是 | Cloudflare 账号 ID |
| `DOMAIN` | 是 | 邮件域名的 JSON 数组，例如 `["example.com"]` |
| `ADMIN` | 是 | 管理员邮箱，例如 `admin@example.com`；域名应包含在 `DOMAIN` 中 |
| `JWT_SECRET` | 是 | 自行生成的随机密钥；当前工作流不接受 `?`、`%`、`#`、`/` 和反斜杠，建议使用随机十六进制字符串 |
| `NAME` | 否 | Worker 名称，默认 `cloud-mail`；这是既有部署资源名，不随项目品牌重命名 |
| `CUSTOM_DOMAIN` | 否 | Web 访问域名，例如 `mail.example.com`，不含协议；与邮件域名可以不同 |
| `D1_DATABASE_ID` | 否 | 复用已有 D1 数据库；留空时工作流按 `NAME` 查找或创建 |
| `KV_NAMESPACE_ID` | 否 | 复用已有 KV 命名空间；留空时工作流按 `NAME` 查找或创建 |
| `R2_BUCKET_NAME` | 否 | 已创建的 R2 存储桶名称；留空时移除 R2 绑定 |
| `PROJECT_LINK` | 否 | 保留的项目链接显示开关；后端按布尔开关解析，并非自定义链接地址 |
| `AI_MODEL` | 否 | Workers AI 模型，默认值见工作流 |
| `ANALYSIS_CACHE` | 否 | 统计缓存开关，默认 `false` |
| `CF_EMAIL` | 否 | 设为 `true` 时添加 Cloudflare `send_email` 绑定，使用前确认其收件人限制 |

在 **Actions** 中手动运行部署工作流。以后对 `main` 分支中的前后端代码或工作流的推送也会触发部署，单独修改 README 不会触发。工作流依次执行单元测试、已有数据库迁移、构建部署和数据库初始化。

部署后还需完成以下配置：

1. 在 Cloudflare 为邮件域名启用 Email Routing，完成 DNS 配置，并将所需地址或 Catch-all 路由到该 Worker。
2. 在站点注册与 `ADMIN` 完全一致的邮箱并设置密码；代码按该邮箱识别管理员，初始化不会生成默认管理员密码。
3. 在系统设置中配置 Resend 发件凭据及已验证的发件域名，按需配置附件存储、Turnstile、推送和 OAuth。

### 手动部署与升级

手动部署使用 `mail-worker/wrangler.toml`。先替换其中的 D1、KV 资源标识，设置 `domain`、`admin`、`jwt_secret`，并按需配置自定义域名和可选绑定。保留代码使用的绑定名 `db`、`kv`、`assets`，以及启用时的 `r2`、`ai`、`email`。

完成 Wrangler 登录及配置后，在 `mail-worker` 目录执行：

```powershell
node scripts/migrate-mail-operations.mjs --remote --config wrangler.toml
pnpm run deploy
```

**已有数据库必须在新 Worker 上线前执行迁移。** 脚本对空数据库跳过预迁移；新安装和升级都需在部署后访问 `https://<站点域名>/api/init/<jwt_secret>` 完成初始化／后续迁移，并确认返回 `success`。GitHub Actions 已包含这些步骤。

升级前备份数据库；保留配置中的每小时 Cron，用于邮件操作恢复、清理和配额维护。不要将实际密钥提交到仓库。

## 第三方登录

在系统设置中分别配置和启用 Linux DO、GitHub、Google 或 XAI Connect。当前配置存储在数据库中；不要把 OAuth Client Secret 放入前端 `VITE_*` 环境变量。

XAI Connect 使用本项目适配的 `https://connect.xai.run` OIDC 服务，需要 Client ID、Client Secret 和精确的 HTTPS 回调地址：

```text
https://<邮箱站点的 Web 域名>/api/oauth/xai/callback
```

回调必须与实际登录站点同源。XAI Client Secret 在后端加密保存；更换 `jwt_secret` 后需要重新录入该密钥。实现约定见 [XAI OIDC 设计说明](docs/superpowers/specs/2026-08-29-xai-oidc-login-design.md)；当前 Linux DO 和 XAI 的免注册码行为以代码为准。

## 目录结构

```text
puremail/
├── mail-vue/                 # Vue 前端
│   ├── src/                  # 页面、组件、主题、状态和请求
│   ├── test/                 # 前端回归测试
│   ├── design-preview.html   # 开发用模拟数据预览
│   └── .env.release          # 正式构建配置
├── mail-worker/              # Cloudflare Worker 后端
│   ├── src/                  # API、认证、邮件处理、业务和迁移
│   ├── scripts/              # 部署前数据库迁移
│   ├── test/                 # 后端回归测试
│   └── wrangler*.toml        # 本地、手动及 Actions 部署配置
├── .github/workflows/        # 测试、构建和部署工作流
├── docs/                     # 本分支设计、实现与验收记录
├── doc/                      # 上游保留的图片资源
└── LICENSE
```

## 许可证与致谢

本项目采用 [MIT 许可证](LICENSE)。原始版权声明为 `Copyright (c) 2025 aslost`，保留在 `LICENSE` 中。感谢 [Cloud Mail](https://github.com/maillab/cloud-mail) 原作者及贡献者提供的基础实现。
