# GitHub Actions 说明

本仓库的云端编译(GitHub Actions)全部是**按需触发**,不会因为普通 push 就白白占用量:

| 文件 | 作用 |
|---|---|
| `build-windows.yml` | Windows x64 构建:NSIS 安装器 / MSI / 便携版 ZIP |

## 怎么触发

1. **手动构建(推荐)**:仓库页面 → **Actions** → 左侧 `Windows 构建(按需)` → **Run workflow**,
   按需勾选产物(`all` / `nsis` / `msi` / `portable`)、VLC 版本,必要时勾选 `run_verify`。
2. **打标签自动构建**:推送形如 `v1.2.0` 的标签时自动构建并上传全部三种产物。

## 产物去哪了

每个成功/失败的运行,页面上方 **Summary** 里都有 artifact:

- `skald-installers-<run>` → `Xuting_<version>_x64-setup.exe`(NSIS)与 `Xuting_<version>_x64_en-US.msi`
- `skald-portable-<run>` → `Skald_<version>_portable_win-x64.zip`(绿色免安装版；文件名前缀刻意保留)

> 2.18.0 起安装器名随 `productName` 变成 `Xuting_…`，便携版 zip 仍叫 `Skald_…`。
- `skald-build-logs-<run>` → 每阶段完整日志(即使失败也会上传),用来定位云编译错误

> 日志目录叫 `gha-logs`(不带前导点):以 `.` 开头的目录会被 upload-artifact
> 当作隐藏内容跳过,导致"日志没传上来"的假象。

## 排错小贴士

- 失败时 GitHub 会直接标红对应的 step;点开即可看到该阶段输出。
- 想深入排查就下载 `skald-build-logs` artifact,按阶段查看:
  `04-pnpm-install.log`(依赖)、`06-stage-runtime.log`(VLC/ffprobe/tone 暂存)、
  `08-tauri-installers.log`(Rust 编译 + NSIS/WiX 打包)、`10-portable.log`(便携打包)。
- 常见错误与对策:
  - `06` 失败 = 下载/解压 VLC、FFmpeg 或 tone 出问题,日志会写明具体缺哪个文件;
  - `08` 里 cargo 报错 = 代码编译问题(文件:行号 + 错误片段都在日志里);
  - `08` 里 NSIS/WiX 报错 = 打包器问题,日志会打印 makensis/WiX 命令细节;
  - 产物未上传但步骤显示成功 = 检查 `11 · 产物清单` 步骤的 SHA256 输出。
  - clippy 阶段报 `resource path ... doesn't exist` = 说明运行时暂存(step 9)没跑或
    没成功,先看 `09-stage-runtime.log`。
