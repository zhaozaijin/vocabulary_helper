# AI 生字词智能过关小助手 MVP

这是面向参赛演示的 MVP 实现，技术栈对齐技术方案 4.1：

- 前端：React + Vite + TypeScript + Ant Design
- 后端：Python FastAPI
- 数据库：云端 PostgreSQL，本地 SQLite 兜底
- 缓存/异步扩展：Redis
- 文件存储扩展：MinIO/S3
- AI 接入：OpenAI-compatible 大模型适配层，无 Key 时自动使用演示兜底生成

## 本地后端快速验证

推荐使用虚拟环境安装依赖：

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

如果本机已经有可用的系统 Python 依赖，也可以直接运行：

```bash
cd backend
/usr/bin/python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

访问：

- 后端健康检查：http://localhost:8000/api/health
- API 文档：http://localhost:8000/docs

## 本地前后端联调验证

### 1. 启动后端

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

如果 `python3` 指向 Homebrew Python 且缺依赖，可以改用：

```bash
cd backend
/usr/bin/python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

确认后端可用：

```bash
curl http://localhost:8000/api/health
```

### 2. 启动前端

另开一个终端：

```bash
cd frontend
npm install
npm run dev
```

访问：

```text
http://localhost:5173
```

前端开发代理已在 `frontend/vite.config.ts` 中配置，默认会把 `/api` 转发到：

```text
http://localhost:8000
```

如果后端临时跑在其他端口，例如 `8010`，可以创建 `frontend/.env.local`：

```bash
VITE_API_BASE_URL=http://localhost:8010/api
```

然后重启前端。

### 3. 浏览器完整验证路径

打开 `http://localhost:5173` 后按下面流程验证：

1. 进入“教师生成与发布”。
2. 可上传教材截图自动提取课文，或导入 TXT/CSV 词语清单，再点击“AI 生成生字词学习包”。
3. 可在“班级与学生管理”中创建班级并批量导入学生名单。
4. 在生成结果中编辑生字、组词、易错提醒和听写清单，可新增、删除或打开“生字学习卡片”查看拼音、部首、结构、组词、例句和形近字提示。
5. 在“听写任务配置”中选择题型、听写范围、播放间隔、重复次数和截止时间，支持字词听写、单字听写、拼音听写、看拼音写词语、听音选字，点击“确认学习包并发布听写”。
6. 切到“学生 AI 听写”。
7. 选择一个学生，刷新任务，点击“开始”。
8. 设置播放间隔和重复次数，点击“开始自动听写”，系统会自动按间隔播放每个词语。
9. 可以直接输入本题答案完成即时判题，也可以播放完成后上传整张答题照片批量判题；听音选字题会展示选项按钮。
10. 本地未配置 OCR 时会使用 mock：文件名包含 `wrong` 会模拟第二题形近字错误；文件名包含 `blank` 或 `low` 会模拟低置信度并进入教师复核队列。
11. 在“看词语练发音”中选择词语，点击“开始录音/结束录音”，查看 AI 发音评分和纠音建议。
12. 在“专属生字错题本”中生成巩固练习，并可标记“已订正”“已过关”。
13. 点击“完成听写”。
14. 切到“家长端陪练”，查看孩子待完成任务、已完成数量和错题复练状态。
15. 切到“班级学情报告”，选择任务并生成报告。
16. 在“教师复核队列”中批量确认低置信度 OCR 结果；报告会展示 Top 易错字、Top 易错词、单元字词掌握概览、错误类型分布、学生薄弱字词、形近字/同音字排行榜。
17. 可勾选“匿名导出”，点击“导出 Excel”下载真实 `.xlsx`，或点击“导出 Excel 兼容 CSV”下载 CSV；也可点击“打印/保存图片报告”生成适合参赛材料的报告截图。

### 4. 纯接口验证

也可以不打开前端，直接访问 API 文档手工验证：

```text
http://localhost:8000/docs
```

推荐检查接口：

- `GET /api/health`
- `POST /api/classes`
- `POST /api/classes/{class_id}/students/import`
- `POST /api/materials/extract-image`
- `POST /api/learning-packs/generate`
- `PUT /api/learning-packs/{pack_id}`
- `POST /api/learning-packs/{pack_id}/confirm`
- `POST /api/dictation-tasks`
- `POST /api/dictation-tasks/{task_id}/publish`
- `POST /api/student/tasks/{task_id}/submissions`
- `POST /api/submissions/{submission_id}/answers`
- `POST /api/submissions/{submission_id}/answers/image-sheet`
- `POST /api/pronunciation/evaluate`
- `PATCH /api/student/mistakes/{mistake_id}`
- `GET /api/review/pending-answers`
- `POST /api/review/answers/{answer_id}`
- `POST /api/review/answers/batch`
- `GET /api/reports/tasks/{task_id}`
- `POST /api/reports/tasks/{task_id}/export`
- `POST /api/reports/tasks/{task_id}/export.xlsx`

## 云端部署

```bash
cd deploy
cp .env.example .env
# 编辑 .env，至少修改数据库和 MinIO 密码；如需真实 AI 生成，填写 AI_API_BASE / AI_API_KEY / AI_MODEL
docker compose up -d --build
```

部署完成后访问：

- 前端：http://服务器IP/
- 后端 API：http://服务器IP:8000/api/health
- MinIO 控制台：http://服务器IP:9001

详细部署和云服务接入说明见：

[docs/cloud_deployment_and_ai_integration.md](./docs/cloud_deployment_and_ai_integration.md)
