# 贡献指南

欢迎提交可复现的问题、文档改进和范围明确的代码修改。较大的功能或架构改动请先开 Issue 讨论。

## 开始开发

1. Fork 仓库，从最新 `main` 创建功能分支。
2. 按 [README](README.md) 安装后端依赖与前端依赖；无云服务密钥即可运行演示。
3. 修改尽量聚焦一个问题；行为变化附上相应测试。
4. 在仓库根目录运行：

```bash
python -m unittest discover -s tests -v
cd frontend
npm ci
npm run build
```

`python` 应来自已安装 `backend/requirements.txt` 的虚拟环境。Compose 测试需要 Docker Compose CLI，只解析配置，不启动服务；未安装时会跳过。CI 还会执行 Gitleaks 扫描。

本地如已安装 Gitleaks，可在根目录执行 `gitleaks git --redact .`；未提交文件可使用 `gitleaks dir --redact .` 检查。

## Issue 与 Pull Request

- Bug：说明运行环境、复现步骤、预期结果、实际结果，附脱敏日志。
- PR：说明解决的问题、修改范围、验证命令与结果；文档更新也请检查链接和示例命令。
- 保持前端锁文件与依赖修改一致，不提交 `node_modules`、构建产物、数据库或运行日志。
- 不提交密钥、`.env`、真实学生名单、照片、录音或个人联系方式；截图和导出报告同样需要检查。
- 漏洞或凭据泄露请遵循 [SECURITY.md](SECURITY.md)，不要把可利用细节或真实凭据放入公开 Issue。

提交贡献表示你有权提交相关内容，并同意将该贡献按项目 MIT 许可证提供。第三方内容应注明来源及适用许可，不要复制未获授权的完整教材。
