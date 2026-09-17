# AI 生字词智能过关小助手

面向小学语文生字词练习的全栈教学演示项目：从词语材料生成学习包，到听写、发音练习、错题复练和班级报告，串起教师、学生与家长的演示流程。

**无需 API Key 即可本地体验。** 未配置云服务时，学习包使用内置规则，OCR/ASR 使用模拟结果；模拟识别与评分不能作为真实学习评估。

> 当前版本为 MVP，未实现完整登录鉴权、角色授权和租户隔离。请使用演示数据，在本机或受限网络中体验；不要直接接入真实学生数据或暴露到公网。详见 [安全说明](SECURITY.md)。

## 功能

- **教师端**：导入 TXT/CSV 词语清单或教材图片，生成并编辑学习包，管理班级与学生，发布多种题型的听写任务。
- **学生端**：听写练习、文本作答、答题照片识别、发音练习与错题复练。
- **家长端**：查看演示学生的任务和练习情况。
- **报告与复核**：低置信度识别复核、班级易错统计、匿名 Excel/CSV 导出。
- **可选云服务**：OpenAI-compatible 大模型接口、阿里云 OCR / NLS 一句话识别、自定义 OCR/ASR 网关。

## 技术栈

| 层次 | 实现 |
| --- | --- |
| 前端 | React 19、TypeScript、Vite、Ant Design |
| 后端 | Python、FastAPI、httpx |
| 数据库 | 本地 SQLite；Compose 部署使用 PostgreSQL |
| 扩展基础设施 | Compose 提供 Redis、MinIO；不代表所有缓存、任务队列与文件存储功能已实现 |

## 本地快速开始

准备 Python 3.12、Node.js 22 和 npm。无需 Docker 或云服务账号。

```bash
git clone https://github.com/zhaozaijin/vocabulary_helper.git
cd vocabulary_helper
```

### 1. 启动后端

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Windows PowerShell 使用 `.venv\Scripts\Activate.ps1` 激活虚拟环境。

首次启动自动创建本地 SQLite 数据及演示内容。访问 [健康检查](http://localhost:8000/api/health) 或 [API 文档](http://localhost:8000/docs)。

### 2. 启动前端

另开一个终端，在仓库根目录执行：

```bash
cd frontend
npm ci
npm run dev -- --host 127.0.0.1
```

打开 [http://localhost:5173](http://localhost:5173)。开发服务器将 `/api` 转发到本机 `8000` 端口。

### 3. 体验流程

1. 在教师端生成并编辑学习包，确认后发布听写任务。
2. 在学生端选择演示学生并完成听写，查看错题与发音练习。
3. 回到教师端复核结果，生成班级报告并尝试匿名导出。

完整流程见 [用户手册](docs/user_manual.md)。演示重置接口会改写演示数据，请勿将其用于真实教学记录。

## 可选：接入真实 AI / OCR / ASR

本地后端可复制示例文件，填入自己的服务配置：

```bash
cd backend
cp .env.example .env
# 编辑 .env；开启大模型至少填写 AI_API_BASE、AI_API_KEY、AI_MODEL
# 在已激活的虚拟环境中运行：
python -m uvicorn app.main:app --env-file .env --reload --host 127.0.0.1 --port 8000
```

应用通过环境变量读取配置；单独复制 `.env` 不会自动加载，需使用上述 `--env-file` 或由运行环境注入。密钥只放后端，**不要写入 `VITE_*` 变量**，后者会进入浏览器构建产物。

云服务可能产生费用，并接收请求中的文本、图片或音频。仅使用有权处理的测试材料；准确率、数据处理条款和费用由所选服务决定。配置说明见 [云服务接入指南](docs/cloud_deployment_and_ai_integration.md)。

## Docker Compose 演示部署

需要 Docker Engine / Desktop 和 Compose v2 或更新版本。

```bash
cd deploy
cp .env.example .env
# 分别运行两次，生成不同密码，手动填入 .env：
openssl rand -hex 24
openssl rand -hex 24
# 填写 POSTGRES_PASSWORD 和 MINIO_ROOT_PASSWORD 后：
docker compose config --quiet
docker compose up -d --build
```

密码为空或未设置时 Compose 会拒绝启动。默认所有映射端口仅绑定 `127.0.0.1`：前端 `80`、后端 `8000`、MinIO `9000/9001`；PostgreSQL 与 Redis 不映射宿主机端口。前端容器内的 Nginx 已代理 `/api`。

在部署主机访问 [http://localhost](http://localhost)。远程机器可通过 SSH 隧道体验：

```bash
ssh -N -L 8080:127.0.0.1:80 user@your-server
```

随后访问本地 `http://localhost:8080`。如果端口冲突，修改 `deploy/.env` 对应端口。已有 PostgreSQL 数据卷的密码不会随 `.env` 自动更新，迁移前请备份并按数据库密码轮换流程操作。

## 开发与验证

在仓库根目录、使用装好后端依赖的 Python 环境执行：

```bash
python -m unittest discover -s tests -v
cd frontend
npm ci
npm run build
```

Compose 配置测试需要 `docker compose`；未安装时会明确跳过，不会启动容器或连接真实数据库。CI 运行后端测试、前端构建、Compose 配置验证和 Gitleaks 全历史扫描。

## 目录与文档

```text
backend/       FastAPI、数据库与云服务适配
frontend/      React 页面与 API 客户端
deploy/        Compose 与环境变量示例
tests/         后端及部署配置测试
docs/          用户手册与部署说明
```

- [产品需求](ai_chinese_word_pass_assistant_prd.md) / [技术设计](ai_chinese_word_pass_assistant_technical_design.md)：包含规划内容，实际能力以代码为准。
- [贡献指南](CONTRIBUTING.md)：运行检查、提交问题和 Pull Request。
- [安全说明](SECURITY.md)：部署边界、凭据保护和漏洞报告方式。
- [第三方内容说明](THIRD_PARTY_NOTICES.md)：依赖及教材相关内容的使用边界。

## 后续方向

- 登录鉴权、角色权限与班级数据隔离。
- 上传限制、调用限流及云服务预算控制。
- 完善识别与生成的效果验证，减少演示兜底带来的误解。
- 补充端到端测试与数据库迁移管理。

## 许可证

项目原创代码和文档采用 [MIT License](LICENSE)。第三方依赖和第三方内容仍遵循各自许可；本许可证不授予教材、商标或用户上传材料的额外使用权。
