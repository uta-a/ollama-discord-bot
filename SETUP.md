# セットアップガイド

このドキュメントは、プロジェクトを初めて動かすための手順書です。

---

## 目次

1. [前提条件](#1-前提条件)
2. [Discord Bot の作成](#2-discord-bot-の作成)
3. [リポジトリのクローン](#3-リポジトリのクローン)
4. [環境変数の設定](#4-環境変数の設定)
5. [依存パッケージのインストール](#5-依存パッケージのインストール)
6. [スラッシュコマンドの登録](#6-スラッシュコマンドの登録)
7. [VOICEVOX エンジンの準備（任意）](#7-voicevox-エンジンの準備任意)
8. [Bot の起動](#8-bot-の起動)
9. [動作確認](#9-動作確認)
10. [管理画面の使い方](#9-管理画面の使い方)
11. [動作確認](#10-動作確認)
12. [コマンドリファレンス](#コマンドリファレンス)

---

## 1. 前提条件

### 全機能共通

| ツール | バージョン | インストール方法 |
|--------|-----------|----------------|
| Node.js | 16.11 以上 | https://nodejs.org/ |
| Ollama | 最新版 | https://ollama.com/ |

```bash
# バージョン確認
node --version
ollama --version
```

### VOICEVOX（音声読み上げ）を使う場合のみ

| ツール | 用途 | インストール方法 |
|--------|------|----------------|
| ffmpeg | WAV→Opus 変換（Discord 音声再生） | `brew install ffmpeg`（macOS）/ `apt install ffmpeg`（Ubuntu） |
| Xcode CLT | `@discordjs/opus` ネイティブビルド（macOS のみ） | `xcode-select --install` |
| VOICEVOX エンジン | 音声合成 | [公式サイト](https://voicevox.hiroshiba.jp/) または Docker |

---

## 2. Discord Bot の作成

### 2-1. アプリケーションの作成

1. [Discord Developer Portal](https://discord.com/developers/applications) を開く
2. **New Application** をクリック → 名前を入力して作成

### 2-2. トークンと Client ID の取得

1. 左メニューの **Bot** → **Reset Token** → トークンをコピー（`DISCORD_TOKEN`）
   - トークンは一度しか表示されないので必ず保存する
2. 同じ **Bot** ページの **Privileged Gateway Intents** セクションで **MESSAGE CONTENT INTENT** を ON にして保存する
   - これを有効にしないと自動読み上げ（`/voicevox auto`）が動作しない
3. 左メニューの **OAuth2** → **Client ID** をコピー（`CLIENT_ID`）

### 2-3. Bot 権限の設定

**OAuth2 URL Generator** で以下を選択して Bot 招待 URL を生成:

- Scopes: `bot`, `applications.commands`
- Bot Permissions:
  - `Send Messages`
  - `Attach Files`
  - `Connect`（VOICEVOX を使う場合）
  - `Speak`（VOICEVOX を使う場合）

生成した URL をブラウザで開き、テストサーバーに Bot を招待する。

### 2-4. サーバー ID の取得（任意）

`GUILD_ID` は `npm run deploy-commands` 実行時に旧ギルドコマンドを自動削除するためにのみ使用する（Bot の動作自体には不要）。

1. Discord の **設定 → 詳細設定 → 開発者モード** を有効にする
2. テストサーバーのアイコンを右クリック → **サーバー ID をコピー**（`GUILD_ID`）

### 2-5. ユーザーアプリ（DM 対応）を有効化する

Bot をユーザーアカウントにインストールすると `/ask` `/chat` `/help` をユーザー間 DM でも使えるようになる。

1. Developer Portal → アプリ → **Installation** タブを開く
2. **Default Install Settings** の **User Install** にチェックを入れる（`applications.commands` スコープを追加）
3. 保存後に表示される **Install Link** から自分のアカウントにインストールする

---

## 3. リポジトリのクローン

```bash
git clone <リポジトリURL>
cd discord-bot
```

---

## 4. 環境変数の設定

プロジェクトルートに `.env` ファイルを作成する:

```bash
cp .env.example .env   # .env.example がある場合
# または直接作成
touch .env
```

### LLM チャットのみ使う場合

```env
# 必須
DISCORD_TOKEN=your-bot-token
CLIENT_ID=your-application-client-id
GUILD_ID=your-test-server-id   # 任意（旧 guild コマンド削除用）

# Ollama（省略可）
OLLAMA_HOST=http://127.0.0.1:11434
OLLAMA_MODEL=gemma4
MAX_CONCURRENT=2
MAX_HISTORY_LENGTH=20
SESSION_TIMEOUT_MS=1800000

# 管理画面 Web UI（省略可）
ADMIN_PANEL_PORT=3001   # 設定すると http://127.0.0.1:3001 で管理画面が開く
```

### VOICEVOX も使う場合（上記に追加）

```env
# VOICEVOX（省略可）
VOICEVOX_HOST=http://127.0.0.1:50021
VOICEVOX_TIMEOUT_MS=60000
VOICEVOX_MAX_CONCURRENT=1
```

---

## 5. 依存パッケージのインストール

```bash
npm install
```

---

## 6. スラッシュコマンドの登録

Discord にスラッシュコマンドをグローバル登録する（初回、またはコマンドを追加・変更したとき）:

```bash
npm run deploy-commands
```

成功すると以下のようなメッセージが表示される:

```
旧 guild コマンドをクリアしました。     # GUILD_ID が設定されている場合のみ
N 個のコマンドをグローバル登録しました（反映に最大 1 時間かかります）。
```

> **注意**: グローバルコマンドは Discord の全クライアントへの反映に最大 1 時間かかる。急ぎの場合は Discord クライアントを再起動すると早まることがある。

---

## 7. VOICEVOX エンジンの準備（任意）

`/voicevox` コマンドを使う場合のみ実行する。

### 公式デスクトップアプリ（推奨）

1. [VOICEVOX 公式サイト](https://voicevox.hiroshiba.jp/) からアプリをダウンロード・インストール
2. アプリを起動する（デフォルトで `http://127.0.0.1:50021` を待ち受ける）

### Docker を使う場合

```bash
docker run --rm -p 50021:50021 voicevox/voicevox_engine:cpu-ubuntu20.04-latest
```

### 起動確認

```bash
curl http://127.0.0.1:50021/speakers | head -c 100
```

スピーカー一覧の JSON が返れば正常。

---

## 8. Bot の起動

### Ollama の起動

```bash
ollama serve
```

### 必要なモデルのダウンロード（初回のみ）

```bash
ollama pull gemma4:e2b
ollama pull gemma4:latest
```

### Bot の起動

開発モード（ファイル変更を自動検知して再起動）:

```bash
npm run dev
```

本番モード:

```bash
npm run build
npm start
```

---

## 9. 管理画面の使い方

### Web 管理画面

`.env` に `ADMIN_PANEL_PORT=3001` を設定して Bot を起動（`npm run dev` または `npm start`）。

```
管理画面: http://127.0.0.1:3001 で待機中（認可なし・localhost 専用）。
```

上記のログが出たらブラウザで `http://127.0.0.1:3001` を開く。

**送信手順:**
1. 「サーバー」で宛先のサーバーを選択
2. 「チャンネル」で宛先のチャンネルを選択（Bot が `SendMessages` 権限を持つチャンネルのみ表示）
3. 本文テキストを入力（空でも可。Embed かファイルがあれば送信できる）
4. 「Embed を追加」で整形されたメッセージを作成（タイトル・説明・カラーなど）
5. ファイルを選択・ドロップ（最大 10 個 / 1 個 25MB）
6. 「送信する」をクリック

**セキュリティ前提:** 認可なし・`127.0.0.1` 固定バインド。ブラウザを開けるのはこの PC のローカルユーザーのみ。

### CLI（管理コマンド）

Bot 本体が起動していなくても使える。

**対話モード（サーバー・チャンネルを対話形式で選択）:**
```bash
npm run admin
```

**非対話モード:**
```bash
# テキストのみ
npm run admin -- --channel <channelId> --content "お知らせです"

# ファイル添付
npm run admin -- --channel <channelId> --file ./log.txt --file ./screenshot.png

# Embed 付き
npm run admin -- --channel <channelId> \
  --content "定期お知らせ" \
  --embed '{"title":"タイトル","description":"説明文","color":"#5865f2"}'
```

**JSON ファイルモード（スクリプト・自動化向け）:**
```bash
npm run admin -- --json ./payload.json
```

`payload.json` の例:
```json
{
  "channelId": "1234567890123456789",
  "content": "定期レポート",
  "embeds": [
    {
      "title": "今週のまとめ",
      "description": "詳細はこちら",
      "color": "#23a559",
      "fields": [
        { "name": "件数", "value": "42", "inline": true }
      ]
    }
  ],
  "files": ["./report.pdf"]
}
```

> **注意:** Bot 本体が起動中のときに `npm run admin` を実行すると、同じトークンで 2 つの接続が競合し、先に起動していた側が切断されます。Bot 稼働中は Web 管理画面を使ってください。

---

## 10. 動作確認

### LLM チャット

Discord のテストサーバーで以下を試す:

```
/ask prompt:こんにちは
```

Bot から返答があれば正常。

```
/bot status
```

現在の処理件数やセッション数が表示される。

### VOICEVOX 読み上げ

**単発読み上げ:**

1. VOICEVOX エンジンを起動する
2. ボイスチャンネルに入る
3. 読み上げを実行（未接続なら Bot が自動参加）:
   ```
   /voicevox say text:こんにちは speaker:zundamon
   ```
4. 音声が再生されれば正常

**自動読み上げモード（個人）:**

1. プロファイルを設定して自動読み上げを ON にする:
   ```
   /voicevox auto speaker:zundamon
   ```
2. 以降、そのチャンネルで `/` なしで送信したメッセージが自動で読み上げられる
3. 停止するには:
   ```
   /voicevox stop
   ```

**全員読み上げモード:**

1. チャンネル全員の読み上げを ON にする（フォールバック声を指定）:
   ```
   /voicevox auto-all speaker:zundamon
   ```
2. 以降、そのチャンネルの全員のメッセージが読み上げられる
   - プロファイル登録済みのユーザーはそれぞれの登録声を使用
   - 未登録ユーザーはフォールバック声（上記で指定）を使用
3. 停止するには:
   ```
   /voicevox stop-all
   ```

---

## コマンドリファレンス

Discord のチャット欄にそのまま貼り付けて使えるコマンド一覧。

### /ask — 単発質問

```
/ask prompt:こんにちは
```
```
/ask prompt:このコードを説明して file:<ファイルを添付>
```
```
/ask prompt:この画像は何？ file:<画像を添付>
```
```
/ask prompt:要約して model:llama3.2
```

---

### /chat — 会話（履歴あり）

```
/chat prompt:こんにちは
```
```
/chat prompt:続きを教えて file:<ファイルを添付>
```
```
/chat prompt:こんにちは model:llama3.2
```
```
/chat prompt:新しい話題 reset:True
```

---

### /voice — ボイスチャンネル

```
/voice join
```
```
/voice leave
```

---

### /voicevox — VOICEVOX 読み上げ

```
/voicevox say text:こんにちは speaker:zundamon
```
```
/voicevox auto speaker:zundamon
```
```
/voicevox stop
```
```
/voicevox auto-all speaker:zundamon
```
```
/voicevox stop-all
```
```
/voicevox profile speaker:metan
```

---

### /voicevox dict — 読み上げ辞書

```
/voicevox dict add surface:ずんだもん pronunciation:ズンダモン
```
```
/voicevox dict add surface:Claude pronunciation:クロード accent_type:1
```
```
/voicevox dict list
```
```
/voicevox dict remove surface:ずんだもん
```

- `pronunciation` はカタカナで入力する（長音符 `ー` 可）
- `accent_type` は省略すると `0`（平板）になる
- 辞書はサーバーごとに保存され Bot 再起動後も維持される
- 同じ `surface` を再度 `add` すると上書きされる

---

### /bot — 管理・設定

```
/bot status
```
```
/bot models
```
```
/bot ollama action:start
```
```
/bot ollama action:stop
```
```
/bot config key:voicevox value:false
```
```
/bot config key:voicevox value:true
```

---

## トラブルシューティング

**「Ollama に接続できません」と表示される**
```bash
ollama serve
```

**「モデルが見つかりません」と表示される**
```bash
ollama pull gemma4:e2b
```

**「VOICEVOX エンジンに接続できません」と表示される**
- VOICEVOX デスクトップアプリを起動する
- または `curl http://127.0.0.1:50021/speakers` で疎通確認する
- VOICEVOX_HOST が正しいか `.env` を確認する

**音声が再生されない**
- ffmpeg がインストールされているか確認: `which ffmpeg`
- Bot に **接続** と **発言** 権限があるか確認

**環境変数エラーで起動しない**
- `.env` に `DISCORD_TOKEN` と `CLIENT_ID` が設定されているか確認する（`GUILD_ID` は任意）

**DM でコマンドが表示されない**
- Developer Portal の **Installation** タブで User Install を有効化しているか確認する
- `npm run deploy-commands` でグローバル登録済みか確認する（反映まで最大 1 時間）

**`@discordjs/opus` のビルドエラー（macOS）**
```bash
xcode-select --install
npm install
```
