# 如何使用该 JS（仅针对当前最新版本）

## 当前 JS 最新链接

前两个优先使用，第三个兜底：



1. [https://seasinvo.github.io/4KCC_Tool/versions/js/4KCC-engine-latest.js](https://seasinvo.github.io/4KCC_Tool/versions/js/4KCC-engine-latest.js)

2. [https://raw.githubusercontent.com/SeaSinvo/4KCC_Tool/main/versions/js/4KCC-engine-latest.js](https://raw.githubusercontent.com/SeaSinvo/4KCC_Tool/main/versions/js/4KCC-engine-latest.js)

3. [https://ghproxy.net/https://raw.githubusercontent.com/SeaSinvo/4KCC_Tool/main/versions/js/4KCC-engine-latest.js](https://ghproxy.net/https://raw.githubusercontent.com/SeaSinvo/4KCC_Tool/main/versions/js/4KCC-engine-latest.js)

> **注意：一定要加载 JSZip 这个库！**
> 参考链接（并非最新）：
> [https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js](https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js)

## 如何使用

### 初级教程



```js
// 1. 导入谱面（异步，需要 await）
//    支持 pez / mcz / osz / 4kz，不接受原装 zip，需要提供正确后缀名
await __4kccEngine.InputChart(file);

// 2. 解析难度（同步，无需 await）
__4kccEngine.InputLevel();

// 3. 指定目标格式（同步，无需 await）：pez / mcz / osz / 4kz
__4kccEngine.InputGoal('pez');

// 4. 打包导出（异步，需要 await）
//    默认会向公开计数网站上报转谱次数；括号内填写 0 则不会上报转谱次数
await __4kccEngine.PutoutChart();
```

最后一步的返回值中：



* `blob`：谱面二进制文件

* `filename`：谱面名称

每个方法返回的结果对象里，



* `ok` 为该步骤是否成功（布尔值）；如果失败，还会返回：

* `code`：错误码

* `message`：错误说明

### 进阶教程

正在思考如何解释中……