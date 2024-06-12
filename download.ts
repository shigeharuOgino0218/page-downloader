import * as fs from "node:fs/promises";
import { chromium } from "@playwright/test";
import { log } from "node:console";

const targetFiles: string[] = [];

const option = {
  dist: "dist",
  pages: [{ url: "https://www.apple.com/", withHTML: true }],
  timeout: 5000,
};

(async () => {
  const { pages: targetPages, timeout } = option;
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  let currentHost = "";

  page.on("response", async (response) => {
    try {
      const responseURL = response.url();

      if (targetFiles.includes(responseURL)) return;

      const isSameHost = new URL(responseURL).host === currentHost;

      if (response.status() === 200 && isSameHost) {
        const isImg = /\.(jpg|jpeg|png|gif|svg|webp)/.test(responseURL);
        const data: Buffer | string = isImg
          ? Buffer.from(await response.body())
          : await response.text();
        const encoding: BufferEncoding = isImg ? "binary" : "utf8";

        targetFiles.push(responseURL);
        await downloadFile(currentHost, responseURL, data, encoding);
      }
    } catch (error) {
      console.error(error);
    }
  });

  for (const targetPage of targetPages) {
    const { url } = targetPage;

    currentHost = new URL(url).host;

    console.log(`HOST: ${currentHost}`);

    await page.goto(url);
    await page.keyboard.press("End"); // ページ末端へスクロール
    await page.waitForTimeout(500);
    await page.setViewportSize({
      width: 640,
      height: 480,
    });
    await page.waitForTimeout(timeout); // 全てのアセットを読み込むまでの待ち時間
  }

  // 処理が終了しないので明示的に終了させる
  process.exit(1);
})();

async function downloadFile(
  host: string,
  assetURL: string,
  data: string | Buffer,
  encoding: BufferEncoding
) {
  try {
    const url = new URL(assetURL);
    const { host: targetHost, pathname } = url;

    if (targetHost !== host) throw new Error("別サイトのアセットです。");

    const assetName = pathname.split("/").at(-1) || "index.html"; // アセット名
    const assetDir = pathname.replace(assetName, ""); // アセットのディレクトリ
    const assetDist = `${option.dist}${assetDir}`.replace(/\/\//g, "/"); // アセットの吐き出し先
    const assetDistFull = `${assetDist}${assetName}`;

    // 吐き出し先のディレクトリがない場合は新たに作成
    if (!(await exists(assetDist))) {
      await fs.mkdir(assetDist, { recursive: true });
    }

    await fs.writeFile(assetDistFull, data, encoding);

    console.log(assetURL);
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(error);
    }
  }
}

/**
 * fs.promises.exists がない？ので関数作成
 * https://github.com/nodejs/node/issues/39960
 * @param f - ファイルパス
 * @returns {boolean}
 */
async function exists(f: string) {
  try {
    await fs.stat(f);
    return true;
  } catch {
    return false;
  }
}
