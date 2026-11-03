# 睡觉倒计时 / Sleep Countdown

在 Harness Web UI 的输入框下方显示距离睡觉的倒计时，到点播放提示音。

## 安装

```bash
dsh plugin --profile desktop add https://github.com/yujiajie01/dsh-sleep-countdown
```

安装后重启 Harness 生效。

## 行为

- 目标时间：**工作日（周一至周五）23:30**，使用浏览器本地时区。
- 周五 23:30 之后、或周末，倒计时指向下一个工作日的 23:30。
- 剩余时间小于 1 小时变黄，小于 10 分钟变红。
- 到点后显示「该睡觉了，晚安」，播放三组柔和的钟声，可「再等 10 分钟」或「知道了」。
- 右侧喇叭按钮可静音/开启提示音，设置保存在浏览器 `localStorage`，刷新后仍然有效。
- 浏览器要求先与页面交互才能播放声音：首次打开若显示「声音待启用」，在页面任意处点一下即可。

## 修改时间或工作日

编辑 `client.js` 顶部的常量：

```js
const TARGET_HOUR = 23;
const TARGET_MINUTE = 30;
const WORKDAYS = [1, 2, 3, 4, 5]; // 0=周日 … 6=周六
```

改完重新执行 `plugin_manager` 的 `install_bundle`（或重启 Harness 以加载新代码）。

## 结构

- `index.js` — Host 半，空实现。
- `client.js` — Client 半，注册到 `conversation.composer.dock` 插槽。
- `locale/*.json` — 插件管理器中显示的标题与描述。
- `icon.svg` — 插件图标（原创）。
