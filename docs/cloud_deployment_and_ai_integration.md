# 云端部署与 AI 服务接入方案

版本：V0.1  
日期：2026-05-19  
适用项目：AI 生字词智能过关小助手参赛 MVP

## 1. 部署目标

本 MVP 按技术方案 4.1 推荐栈实现：

- 前端：React + Vite + TypeScript + Ant Design
- 后端：Python FastAPI
- 数据库：PostgreSQL
- 缓存与异步扩展：Redis
- 对象存储扩展：MinIO，后续可替换为阿里云 OSS、腾讯云 COS、火山 TOS、AWS S3
- AI 服务：OpenAI-compatible 大模型接口

部署后可完整跑通：

1. 教师端通过教材样例、教材截图 OCR 或词语清单生成生字词学习包。
2. 教师创建班级并批量导入学生名单。
3. 教师编辑学习包中的生字、组词、易错提醒和听写清单。
4. 教师配置题型、范围、间隔、重复次数和截止时间后发布听写任务，支持字词听写、单字听写、拼音听写、看拼音写词语和听音选字。
5. 学生端完成 AI 语音听写、文本判题、照片判题和发音练习。
6. 系统自动判题并归集错题，低置信度结果进入教师复核队列。
7. 学生查看错题本并生成巩固练习。
8. 家长端查看孩子待完成任务、完成情况和错题复练状态。
9. 教师查看班级学情报告、Top 易错字词、单元掌握概览、错误类型分布、学生薄弱字词和形近字/同音字排行榜。
10. 教师导出 Excel/CSV 报告，或打印保存图片报告。

## 2. 云服务器建议

### 2.1 最小配置

适合参赛演示和小范围试点：

- CPU：2 核
- 内存：4 GB
- 系统盘：40 GB
- 操作系统：Ubuntu 22.04 LTS 或 Debian 12
- 带宽：3 Mbps 以上

### 2.2 推荐配置

适合真实班级试用：

- CPU：4 核
- 内存：8 GB
- 系统盘：80 GB
- 数据盘：100 GB
- 带宽：5 Mbps 以上

### 2.3 端口规划

| 端口 | 服务 | 是否必须公网开放 |
| --- | --- | --- |
| 80 | 前端 Web | 是 |
| 443 | HTTPS | 正式环境建议开放 |
| 8000 | 后端 API | 演示可开放，正式建议只内网 |
| 9000 | MinIO API | 正式建议只内网 |
| 9001 | MinIO 控制台 | 仅管理员临时开放 |
| 5432 | PostgreSQL | 不建议公网开放 |
| 6379 | Redis | 不建议公网开放 |

## 3. 一键部署流程

### 3.1 安装 Docker

在云服务器上安装 Docker Engine 和 Docker Compose Plugin。安装完成后确认：

```bash
docker --version
docker compose version
```

### 3.2 上传代码

将项目代码上传到服务器，例如：

```bash
scp -r vocabulary_helper root@your-server-ip:/opt/vocabulary_helper
```

或使用 Git 拉取项目仓库。

### 3.3 配置环境变量

```bash
cd /opt/vocabulary_helper/deploy
cp .env.example .env
vim .env
```

至少修改：

```bash
POSTGRES_PASSWORD=change_me_strong_password
MINIO_ROOT_PASSWORD=change_me_minio_password
```

如果要启用真实大模型生成，继续配置：

```bash
AI_PROVIDER=openai_compatible
AI_API_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1
AI_API_KEY=你的APIKey
AI_MODEL=qwen-plus
```

未配置 `AI_API_KEY` 时，系统会自动使用内置演示规则生成学习包，仍可完整演示。

如果要启用真实答题照片识别，当前后端已支持阿里云 OCR：

```bash
OCR_PROVIDER=aliyun
ALIYUN_ACCESS_KEY_ID=你的阿里云AccessKeyId
ALIYUN_ACCESS_KEY_SECRET=你的阿里云AccessKeySecret
ALIYUN_OCR_ENDPOINT=ocr-api.cn-hangzhou.aliyuncs.com
```

如果要启用真实发音识别，当前后端已支持阿里云智能语音交互“一句话识别”：

```bash
ASR_PROVIDER=aliyun_nls
ALIYUN_ACCESS_KEY_ID=你的阿里云AccessKeyId
ALIYUN_ACCESS_KEY_SECRET=你的阿里云AccessKeySecret
ALIYUN_NLS_APP_KEY=你的智能语音交互项目AppKey
ALIYUN_NLS_REGION=cn-shanghai
ALIYUN_NLS_ENDPOINT=https://nls-gateway-cn-shanghai.aliyuncs.com/stream/v1/asr
ALIYUN_NLS_SAMPLE_RATE=16000
```

如果要接学校已有 OCR/ASR 网关，也可以配置：

```bash
OCR_PROVIDER=your_ocr_gateway
OCR_API_URL=https://your-ocr-gateway.example.com/recognize-answer-sheet
OCR_API_KEY=你的OCR网关Key
ASR_PROVIDER=your_asr_gateway
ASR_API_URL=https://your-asr-gateway.example.com/recognize-pronunciation
ASR_API_KEY=你的ASR网关Key
```

后端会以 multipart 方式上传图片或音频，并读取返回 JSON 中的 `answers`、`recognized_answers`、`texts`、`recognized_text`、`text` 或 `transcript` 字段。若直接接入原厂 API 字段不兼容，建议在学校侧增加一个轻量网关做字段转换。

### 3.4 启动服务

```bash
docker compose up -d --build
```

查看状态：

```bash
docker compose ps
docker compose logs -f backend
```

### 3.5 验证部署

访问：

```text
http://服务器IP/
```

后端健康检查：

```bash
curl http://服务器IP:8000/api/health
```

正常返回示例：

```json
{
  "ok": true,
  "name": "AI 生字词智能过关小助手",
  "database": "postgresql",
  "ai_mode": "cloud",
  "time": "2026-05-19T00:00:00Z"
}
```

如果 `ai_mode` 是 `fallback`，说明未启用云端大模型，但演示流程仍可用。

### 3.6 正式环境功能验证清单

部署后建议按以下顺序验证新增 MVP 功能：

1. `POST /api/classes` 能创建新班级，`POST /api/classes/{class_id}/students/import` 能批量导入学生名单。
2. `POST /api/materials/extract-image` 能从教材截图或 OCR 服务返回 `extracted_text`，前端词语清单导入可追加到生成内容。
3. `PUT /api/learning-packs/{pack_id}` 能保存教师编辑后的生字、组词、易错提醒和听写清单。
4. `POST /api/dictation-tasks` 请求体带 `question_type`、`selected_answers`、`deadline`、`settings.interval_seconds`、`settings.repeat` 后，学生端任务可按配置播放；`question_type` 支持 `word`、`char`、`pinyin`、`pinyin_to_word`、`choice`。
5. 学生端可通过文本输入即时判题，也可上传整张答题照片批量判题；`choice` 题型会生成选项并支持按钮作答。
6. 家长端可读取 `GET /api/student/tasks` 和 `GET /api/student/mistakes`，展示待完成任务、完成情况和错题状态。
7. 上传低置信度答题照片后，`GET /api/review/pending-answers` 能看到待复核记录，`POST /api/review/answers/batch` 可批量确认。
8. 学生错题本可通过 `PATCH /api/student/mistakes/{mistake_id}` 标记已订正、复练中或已过关。
9. `GET /api/reports/tasks/{task_id}` 返回 `top_chars`、`top_words`、`unit_mastery`、`mistake_types`、`similar_shape_rank`、`homophone_rank` 和学生 `weak_words`。
10. `POST /api/reports/tasks/{task_id}/export?anonymous=true` 可匿名导出 CSV；首行包含 PRD 7.8 字段：班级、学生姓名或匿名编号、任务名称、课文或单元、完成时间、总题数、正确题数、正确率、错字列表、高频错误类型、是否完成订正。
11. `POST /api/reports/tasks/{task_id}/export.xlsx?anonymous=true` 可匿名导出真实 Excel 工作簿，包含“听写记录”“班级概览”“易错统计”三个 Sheet。
12. 前端报告页“打印/保存图片报告”可调用浏览器打印能力，保存为 PDF 或系统截图用于参赛材料。

## 4. 域名与 HTTPS

正式展示建议绑定域名，例如：

```text
https://vocab-demo.example.com
```

可在云服务器外层使用 Caddy 或 Nginx 反向代理到前端容器。

### 4.1 Caddy 示例

```caddyfile
vocab-demo.example.com {
  reverse_proxy localhost:80
}
```

### 4.2 Nginx HTTPS 示例

```nginx
server {
  listen 443 ssl http2;
  server_name vocab-demo.example.com;

  ssl_certificate /etc/letsencrypt/live/vocab-demo.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/vocab-demo.example.com/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:80;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
  }
}
```

配置域名后建议将 `deploy/.env` 中的跨域配置改为：

```bash
CORS_ALLOW_ORIGINS=https://vocab-demo.example.com
```

## 5. AI 大模型接入方式

### 5.1 当前 MVP 的 AI 接入点

后端统一在 `backend/app/main.py` 中通过以下环境变量调用 OpenAI-compatible Chat Completions 接口：

```bash
AI_PROVIDER=openai_compatible
AI_API_BASE=模型服务Base URL
AI_API_KEY=模型服务API Key
AI_MODEL=模型名称
```

接口调用逻辑：

- 如果 `AI_API_BASE` 已包含 `/chat/completions`，直接调用该地址。
- 如果只配置 Base URL，后端自动拼接 `/chat/completions`。
- 请求体使用 OpenAI Chat Completions 兼容格式。
- 输出要求为 JSON。
- AI 调用失败或未配置 Key 时自动降级为本地演示生成规则。

### 5.2 阿里云百炼/通义千问接入

阿里云百炼官方文档说明其 OpenAI 兼容模式 `base_url` 可配置为：

```bash
AI_API_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1
AI_MODEL=qwen-plus
AI_API_KEY=你的百炼APIKey
```

如果使用国际或美国地域，请按百炼控制台和官方文档替换为对应地域 Base URL。

配置后重启后端：

```bash
docker compose up -d --build backend
```

验证：

```bash
curl http://服务器IP:8000/api/health
```

返回中的 `ai_mode` 应为 `cloud`。

健康检查中还会返回：

```json
{
  "ocr_mode": "cloud",
  "asr_mode": "cloud"
}
```

未配置 OCR/ASR 时分别显示 `mock`，系统仍可完成参赛演示流程。

### 5.3 DeepSeek 接入

DeepSeek 官方 API 文档说明其 OpenAI-compatible `base_url` 为：

```bash
AI_API_BASE=https://api.deepseek.com
AI_MODEL=deepseek-chat
AI_API_KEY=你的DeepSeek API Key
```

如使用推理模型，可将 `AI_MODEL` 替换为平台当前可用模型名。

### 5.4 豆包/火山方舟接入

在火山方舟控制台创建模型服务或推理接入点后，选择 OpenAI-compatible 调用方式，并配置：

```bash
AI_API_BASE=火山方舟控制台提供的OpenAI兼容Base URL
AI_MODEL=控制台提供的模型或接入点ID
AI_API_KEY=你的火山方舟API Key
```

不同地域和模型的 URL、模型 ID 可能不同，应以控制台展示为准。

### 5.5 文心、讯飞星火等其他模型接入

如果服务商提供 OpenAI-compatible 接口，只需配置：

```bash
AI_API_BASE=兼容接口Base URL
AI_API_KEY=API Key
AI_MODEL=模型名
```

如果服务商不兼容 OpenAI Chat Completions，需要在后端新增一个 provider adapter：

```text
backend/app/main.py
  call_ai_learning_pack()
```

建议后续重构为：

```text
backend/app/services/ai_providers/
  openai_compatible.py
  baidu_wenxin.py
  xunfei_spark.py
  volcengine_ark.py
```

## 6. TTS 语音合成接入方式

### 6.1 MVP 当前方案

当前 MVP 使用浏览器内置 `SpeechSynthesis` 播放中文听写语音，因此不需要额外购买 TTS 服务即可完整演示。

优点：

- 部署简单。
- 没有额外成本。
- 比赛现场更稳定。

限制：

- 不同设备的音色可能略有差异。
- 不能预生成音频文件。

### 6.2 云 TTS 增强方案

后续可接入：

- 阿里云智能语音交互
- 腾讯云语音合成
- 火山引擎语音合成
- 科大讯飞语音合成

建议新增环境变量：

```bash
TTS_PROVIDER=aliyun
TTS_API_KEY=你的TTSKey
TTS_VOICE=标准女声
TTS_SPEED=0.9
```

推荐流程：

1. 教师发布任务时，后端批量生成每道题的音频。
2. 音频文件上传到 MinIO/OSS/COS/TOS。
3. `dictation_items.audio_url` 保存音频访问地址。
4. 学生端优先播放 `audio_url`，失败时回退到浏览器 TTS。

## 7. OCR/手写识别接入方式

### 7.1 MVP 当前方案

当前 MVP 已实现整张答题照片上传、批量判题和教师复核队列：

```text
POST /api/submissions/{submission_id}/answers/image-sheet
```

后端会按当前听写任务的题目顺序写入多条作答记录。未配置云 OCR 时使用 mock 逻辑保证演示流程可用：上传文件名包含 `wrong`、`cuo` 或 `错` 时，会模拟第二题出现形近字错误；文件名包含 `blank` 或 `low` 时会模拟低置信度并进入教师复核队列；否则默认识别为正确答案。

### 7.2 云 OCR 增强方案

可接入：

- 阿里云 OCR
- 腾讯云 OCR
- 百度智能云 OCR
- 火山引擎 OCR

建议新增环境变量：

```bash
OCR_PROVIDER=aliyun
ALIYUN_ACCESS_KEY_ID=你的阿里云AccessKeyId
ALIYUN_ACCESS_KEY_SECRET=你的阿里云AccessKeySecret
ALIYUN_OCR_ENDPOINT=ocr-api.cn-hangzhou.aliyuncs.com
OCR_CONFIDENCE_AUTO_PASS=0.90
OCR_CONFIDENCE_REVIEW=0.70
```

当前后端已内置阿里云 OCR 适配层：

- 学生整张答题照片走 `RecognizeHandwriting`，返回 `answers`、`confidence` 后进入现有自动判题与教师复核队列。
- 教材截图导入走 `RecognizeGeneral`，返回 `extracted_text` 后进入现有学习包生成流程。
- 如果 `OCR_PROVIDER=aliyun` 但未配置 AK/SK，或云端调用失败，会自动回退到演示 mock 逻辑，保证参赛演示不中断。

也可以继续使用自定义 OCR 网关：保持 `OCR_PROVIDER` 非 `aliyun`，填写 `OCR_API_URL` 和 `OCR_API_KEY`，网关返回 `answers` 或 `recognized_answers` 与 `confidence` 即可。

推荐流程：

1. 学生上传听写照片。
2. 前端压缩图片并上传到后端。
3. 后端保存原图到 MinIO 或云对象存储。
4. 后端调用 OCR/手写识别。
5. 返回候选文本、坐标和置信度。
6. 置信度高于 0.90 自动判题。
7. 置信度 0.70-0.90 标记为疑似。
8. 置信度低于 0.70 进入教师复核。

接口规划：

```text
POST /api/submissions/{submission_id}/answers/image
POST /api/submissions/{submission_id}/answers/image-sheet
GET  /api/review/pending-answers
POST /api/review/answers/{answer_id}
POST /api/review/answers/batch
```

当前版本 `image-sheet`、`image`、待复核查询、单题复核和批量复核均已可用。正式环境可直接配置阿里云 OCR，或把 `OCR_API_URL` 指向云 OCR/手写识别网关。

## 8. ASR 语音识别接入方式

### 8.1 MVP 当前方案

当前 MVP 已实现“看词语练发音”接口：

```text
POST /api/pronunciation/evaluate
```

学生端展示目标词语，浏览器录音后上传到后端。未配置云 ASR 时使用 mock 逻辑保证演示流程可用：文件名包含 `wrong`、`cuo` 或 `错` 时模拟发音错误，否则默认识别为目标词语。

### 8.2 云 ASR 增强方案

当前代码已内置阿里云智能语音交互“一句话识别”适配层，适合先完成学生端“看词语练发音”的真实云端识别。学生端录音会上传为 16k WAV，后端自动获取并缓存 NLS Token，再调用一句话识别 REST API。

启用方式：

```bash
ASR_PROVIDER=aliyun_nls
ALIYUN_ACCESS_KEY_ID=你的阿里云AccessKeyId
ALIYUN_ACCESS_KEY_SECRET=你的阿里云AccessKeySecret
ALIYUN_NLS_APP_KEY=你的智能语音交互项目AppKey
ALIYUN_NLS_REGION=cn-shanghai
ALIYUN_NLS_ENDPOINT=https://nls-gateway-cn-shanghai.aliyuncs.com/stream/v1/asr
ALIYUN_NLS_SAMPLE_RATE=16000
ALIYUN_NLS_ENABLE_PUNCTUATION=false
ALIYUN_NLS_ENABLE_ITN=true
ALIYUN_NLS_ENABLE_VOICE_DETECTION=true
```

也可继续接入：

- 腾讯云语音识别
- 火山引擎语音识别
- 科大讯飞语音识别

学校已有 ASR 网关可使用通用配置：

```bash
ASR_PROVIDER=your_asr_gateway
ASR_API_URL=https://your-asr-gateway.example.com/recognize-pronunciation
ASR_API_KEY=你的ASR网关Key
```

推荐流程：

1. 学生点击录音并读出生字或词语。
2. 前端上传音频。
3. 后端保存音频到对象存储。
4. 后端调用 ASR。
5. 后端把识别文本与标准答案比对。
6. 低置信度提示“请再读一次”或进入教师复核。

## 9. 对象存储接入方式

### 9.1 MVP 当前方案

Docker Compose 已内置 MinIO，作为 S3 兼容对象存储。当前主流程尚不强依赖图片和音频上传，但服务已准备好。

### 9.2 替换为云对象存储

可替换为：

- 阿里云 OSS
- 腾讯云 COS
- 火山 TOS
- AWS S3

建议统一使用 S3-compatible 配置：

```bash
S3_ENDPOINT_URL=https://oss-cn-hangzhou.aliyuncs.com
S3_BUCKET=vocab-helper
S3_ACCESS_KEY_ID=你的AccessKey
S3_SECRET_ACCESS_KEY=你的SecretKey
S3_PUBLIC_BASE_URL=https://your-cdn-domain.example.com
```

后端文件访问建议使用短期签名 URL，避免学生图片和语音长期公开。

## 10. Redis 与异步任务接入方式

Docker Compose 已内置 Redis。MVP 当前以同步接口为主，后续可用于：

- AI 学习包生成缓存。
- TTS 音频生成队列。
- OCR 图片识别队列。
- 报告导出任务队列。
- API 限流。

推荐后续加入：

```text
Celery / RQ / Arq
```

典型任务：

```text
generate_learning_pack
generate_tts_audio
recognize_handwriting_image
export_class_report
```

## 11. 生产安全配置建议

### 11.1 必须修改默认密码

部署前必须修改：

```bash
POSTGRES_PASSWORD
MINIO_ROOT_PASSWORD
AI_API_KEY
```

### 11.2 不要公网开放数据库和 Redis

云安全组只开放：

```text
80
443
```

演示期间如需调试可临时开放：

```text
8000
9001
```

调试结束后关闭。

### 11.3 API Key 只放服务端

不要在前端环境变量里配置 AI Key。当前项目只在后端读取：

```bash
AI_API_KEY
```

### 11.4 学生数据保护

- 导出报告可使用学生姓名，也可在真实试点中改成匿名编号。
- 不要把学生姓名、原始照片、语音直接传给大模型。
- AI 学情建议只传聚合统计数据。
- 文件存储使用私有桶和签名 URL。

## 12. 常见问题

### 12.1 前端能打开，但生成学习包失败

检查后端状态：

```bash
docker compose logs -f backend
curl http://服务器IP:8000/api/health
```

如果 AI Key 错误，系统会降级到 fallback；如果数据库异常，检查 PostgreSQL 容器是否健康。

### 12.2 AI 模式一直是 fallback

检查：

```bash
AI_API_BASE
AI_API_KEY
AI_MODEL
```

修改 `deploy/.env` 后重启：

```bash
docker compose up -d --build backend
```

### 12.3 学生端没有任务

先在教师端完成：

1. 生成学习包。
2. 确认学习包。
3. 发布听写任务。

然后学生端点击“刷新任务”。

### 12.4 导出文件乱码

导出的 CSV 已使用 `utf-8-sig`，Excel 通常可直接识别。如果仍乱码，可在 Excel 中通过“数据-自文本/CSV”导入并选择 UTF-8。

## 13. 官方文档参考

- 阿里云百炼 OpenAI 兼容说明：`https://help.aliyun.com/zh/model-studio/what-is-model-studio`
- 阿里云百炼兼容模式 Base URL 示例：`https://help.aliyun.com/zh/model-studio/qwen-mt-api`
- DeepSeek API 文档：`https://api-docs.deepseek.com/`
