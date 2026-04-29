# AgentSecurity 安装实测记录（2026-04-29）

## 执行环境
- 仓库：`https://github.com/HugoO612/AgentSecurity`
- 路径：`/workspace/AgentSecurity`
- 日期：`2026-04-29`（UTC）

## 安装结果
- 命令：`npm install`
- 结果：安装成功（退出码 0）
- 备注：出现 `Unknown env config "http-proxy"` 警告，不影响安装完成。

## 测试结果
- 命令：`npm run test`
- 结果：测试未全部通过（退出码 1）
- 汇总：`18` 个测试文件中 `16` 个通过，`2` 个失败；`57` 个测试中 `52` 个通过，`5` 个失败。

### 失败明细
1. `src/tests/precheck.test.ts`
   - `maps permission-denied WSL output to permission failure`
   - `maps policy-blocked WSL output to unsupported environment failure`
   - `maps disabled WSL output to missing capability failure`
2. `src/tests/release-candidate-script.test.ts`
   - `accepts a live AgentSecurity evidence file`
   - `rejects shimmed or non-AgentSecurity evidence for public launch`

### 关键报错
- `expected 'warning' to be 'blocked'`
- `expected 'precheck' to be 'wsl_enablement'`
- `Error: spawn node ENOENT`

## 结论
- 当前版本可以完成依赖安装。
- 当前版本在该环境下未达到“测试全绿”，需要针对上述 5 个失败测试继续排查（尤其是 `spawn node ENOENT` 以及 precheck 期望值不一致问题）。
