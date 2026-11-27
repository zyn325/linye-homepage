# 光路棋

13×13 双人光学策略棋，支持人机对战和好友在线房间。

需要 Node.js 22 或更新版本。

```sh
corepack pnpm install
corepack pnpm dev
```

开发地址为 `http://localhost:5173`。

```sh
corepack pnpm test
corepack pnpm build
corepack pnpm start
```

生产环境由同一 Node.js 服务提供静态网页及 `/ws` WebSocket 对局连接。
设置 `PORT` 指定监听端口，设置 `DATA_DIR` 指定房间存档目录。
部署时将 `DATA_DIR` 放在持久卷上，并使用支持 WebSocket 的服务托管。
当前房间存储适用于单进程部署。

## Cloudflare 免费部署

Cloudflare Workers 提供网页和实时连接，每个好友房间由一个 SQLite Durable Object 保存。
房间状态在服务器重启和休眠后仍可恢复，网页刷新时使用当前标签页身份重新进入。

```sh
corepack pnpm build
corepack pnpm dev:cloudflare
corepack pnpm exec wrangler login
corepack pnpm deploy
```

`wrangler.jsonc` 声明免费方案支持的 SQLite 存储迁移和网页资源绑定。
GitHub Pages 提供人机入口，完整好友联机使用部署后的 Cloudflare 网址。
Cloudflare 免费额度用尽时服务会受到限制。

## 操作

选择棋盘格子，切换镜面朝向，点击确认落子。键盘 R 切换镜面，Enter 确认，Esc 取消选择。
首页提供四课棋盘练习，包含反射、借用对手镜面、同色镜面相接限制、透射与获胜。
人机模式支持选红蓝方、入门/标准/挑战三档难度、悔棋和本地恢复。
好友模式支持复制房间号或链接、系统分享、粘贴链接加入、双方准备、和棋、认输、自动及手动重连与再来一局。
每手落镜有方框与短暂反馈；光路连通后可查看完整路线，或逐节点播放反射与透射讲解。

## 玩家账号

支持唯一用户名与密码注册、登录、退出、修改密码及恢复码找回。用户名经 NFKC 规范化并忽略大小写查重，支持 2～16 个中文、字母、数字、下划线或短横线。
密码为 10～128 个字符，以独立随机盐和 PBKDF2-SHA256（100,000 次）保存；原始密码与恢复码均不存储。会话随机生成，仅在数据库保存哈希，生产 Cookie 使用 HttpOnly、Secure、SameSite=Lax、__Host- 前缀，最长 30 天。
恢复码在注册与恢复时显示一次；找回账号会轮换恢复码并撤销所有旧会话。未绑定邮箱，遗失密码及恢复码后无法找回。
账号请求有来源校验和服务端限流，修改密码会撤销旧会话。客户端不能选择注册身份，服务器从会话取得账号名及房间身份；游客重名加“游客·”前缀，注册玩家显示身份标记。
Cloudflare 使用独立 SQLite Durable Object `AccountDirectory` 串行处理查重和会话，迁移 `v2-accounts` 不影响原有房间。Node 版本用 `DATA_DIR/accounts.json`（0600）保存，适用于单进程。

## 规则与实现

规则定义位于 `src/game/rules.ts`，浏览器和服务器共用。
寻路按格子与传播方向建立状态，探索己方镜子的反射、透射分支，排除循环。
落子后先检查对手获胜，再检查落子者获胜，最后检查满盘平局。
人机使用启发式光路距离、光源周边可达空间和有限的对手回应搜索，运行在独立工作线程。
标准与挑战会先筛除可防止的单手封口威胁，挑战额外搜索关键回应后的下一步。
评估是有限时间内的启发式搜索，并不保证完美走法。七镜自封光源局面已加入回归测试。

浏览器房间身份保存在当前标签页的会话中。刷新可恢复，同一房间的两位玩家应分别使用自己的浏览器或标签页。
