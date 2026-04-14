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
10. [コマンドリファレンス](#コマンドリファレンス)

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
2. 左メニューの **OAuth2** → **Client ID** をコピー（`CLIENT_ID`）

### 2-3. Bot 権限の設定

**OAuth2 URL Generator** で以下を選択して Bot 招待 URL を生成:

- Scopes: `bot`, `applications.commands`
- Bot Permissions:
  - `Send Messages`
  - `Attach Files`
  - `Connect`（VOICEVOX を使う場合）
  - `Speak`（VOICEVOX を使う場合）

生成した URL をブラウザで開き、テストサーバーに Bot を招待する。

### 2-4. サーバー ID の取得

1. Discord の **設定 → 詳細設定 → 開発者モード** を有効にする
2. テストサーバーのアイコンを右クリック → **サーバー ID をコピー**（`GUILD_ID`）

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
GUILD_ID=your-test-server-id

# Ollama（省略可）
OLLAMA_HOST=http://127.0.0.1:11434
OLLAMA_MODEL=gemma4
MAX_CONCURRENT=2
MAX_HISTORY_LENGTH=20
SESSION_TIMEOUT_MS=1800000
```

### VOICEVOX も使う場合（上記に追加）

```env
# VOICEVOX（省略可）
VOICEVOX_HOST=http://127.0.0.1:50021
VOICEVOX_TIMEOUT_MS=60000
VOICEVOX_MAX_CONCURRENT=1
VOICE_IDLE_TIMEOUT_MS=300000
```

---

## 5. 依存パッケージのインストール

```bash
npm install
```

---

## 6. スラッシュコマンドの登録

Discord にスラッシュコマンドを登録する（初回、またはコマンドを追加・変更したとき）:

```bash
npm run deploy-commands
```

成功すると `Registered N commands.` と表示される。

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

## 9. 動作確認

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

1. VOICEVOX エンジンを起動する
2. ボイスチャンネルに入る
3. `/voice join` で Bot を招待
4. 読み上げを実行:
   ```
   /voicevox text:こんにちは
   ```
5. キャラクター選択メニューで声を選ぶ（冥鳴ひまり / ずんだもん）
6. 音声が再生されれば正常
7. 退出:
   ```
   /voice leave
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
/voicevox text:こんにちは
```
```
/voicevox text:今日も良い天気ですね
```

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
- `.env` に `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID` が設定されているか確認する

**`@discordjs/opus` のビルドエラー（macOS）**
```bash
xcode-select --install
npm install
```
