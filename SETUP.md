# セットアップガイド

このドキュメントは、プロジェクトを初めて動かすための手順書です。

LLM チャット機能だけを使う場合と、TTS（音声読み上げ）も使う場合で必要な手順が異なります。

---

## 目次

1. [前提条件](#1-前提条件)
2. [Discord Bot の作成](#2-discord-bot-の作成)
3. [リポジトリのクローン](#3-リポジトリのクローン)
4. [環境変数の設定](#4-環境変数の設定)
5. [依存パッケージのインストール](#5-依存パッケージのインストール)
6. [スラッシュコマンドの登録](#6-スラッシュコマンドの登録)
7. [TTS サーバーのセットアップ（任意）](#7-tts-サーバーのセットアップ任意)
8. [ボイスプロファイルの追加（任意）](#8-ボイスプロファイルの追加任意)
9. [Bot の起動](#9-bot-の起動)
10. [動作確認](#10-動作確認)

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

### TTS（音声読み上げ）を使う場合のみ

| ツール | 用途 | インストール方法 |
|--------|------|----------------|
| ffmpeg | WAV→Opus 変換（Discord 音声再生） | `brew install ffmpeg`（macOS）/ `apt install ffmpeg`（Ubuntu） |
| Xcode CLT | `@discordjs/opus` ネイティブビルド（macOS のみ） | `xcode-select --install` |
| Python 3.10 以上 | TTS サーバー実行 | https://www.python.org/ |
| CUDA 対応 GPU | Qwen3-TTS モデル推論 | 1.7B モデル: 約 6GB VRAM、0.6B モデル: 約 2GB VRAM |

> **VRAM に注意**: Ollama と TTS サーバーが同一マシンで動く場合、GPU メモリを共有します。
> 両方同時に使うときは合計 VRAM に余裕があることを確認してください。

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
  - `Connect`（TTS を使う場合）
  - `Speak`（TTS を使う場合）

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

### TTS も使う場合（上記に追加）

```env
# TTS サーバー
TTS_SERVER_HOST=http://127.0.0.1:8880
TTS_START_CMD=cd /絶対パス/discord-bot/tts-server/Qwen3-TTS-Openai-Fastapi && .venv/bin/uvicorn main:app --host 0.0.0.0 --port 8880
TTS_PROFILES_DIR=./tts-server/profiles
DEFAULT_VOICE_PROFILE=

# TTS 動作設定（省略可）
TTS_TIMEOUT_MS=60000
TTS_MAX_CONCURRENT=1
TTS_SEMAPHORE_WAIT_MS=30000
VOICE_IDLE_TIMEOUT_MS=300000
```

> `TTS_START_CMD` の `/絶対パス/` 部分は実際のパスに置き換える（例: `/Users/yourname/Projects/discord-bot`）。

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

## 7. TTS サーバーのセットアップ（任意）

TTS / VC 音声読み上げ機能を使う場合のみ実行する。

```bash
cd tts-server
bash setup.sh
```

このスクリプトは以下を自動で行う:
1. [Qwen3-TTS-Openai-Fastapi](https://github.com/groxaxo/Qwen3-TTS-Openai-Fastapi) をクローン
2. Python 仮想環境 (`.venv`) を作成
3. 依存パッケージをインストール

インストールには数分かかる。完了後、プロジェクトルートに戻る:

```bash
cd ..
```

### TTS サーバーの動作確認

Bot を経由せず手動で起動して確認する:

```bash
cd tts-server/Qwen3-TTS-Openai-Fastapi
.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8880
```

別ターミナルでヘルスチェック:

```bash
curl http://localhost:8880/health
```

`{"status":"ok"}` のようなレスポンスが返れば正常。確認後、Ctrl+C でサーバーを停止する。

---

## 8. ボイスプロファイルの追加（任意）

ゼロショットボイスクローンを使うには、参照音声ファイルを配置する。

### ディレクトリ構造

```
tts-server/profiles/<プロファイル名>/
├── meta.json       # プロファイルメタデータ
└── reference.wav   # 3〜10 秒の参照音声
```

### meta.json の内容

```json
{
  "name": "表示名",
  "profile_id": "yourname",
  "ref_audio_filename": "reference.wav",
  "ref_text": "参照音声の内容（正確に書くほど品質が上がる）",
  "language": "ja"
}
```

### 参照音声のポイント

- 長さ: 3〜10 秒
- フォーマット: WAV（16-bit PCM、16kHz または 24kHz 推奨）
- 内容: 背景ノイズなし、自然な発話
- `ref_text` は音声の内容を正確に書く

### デフォルトプロファイルの設定（省略可）

全ユーザー共通で使うデフォルトのプロファイルを設定する場合は `.env` に追加:

```env
DEFAULT_VOICE_PROFILE=yourname
```

---

## 9. Bot の起動

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

### TTS（音声読み上げ）

1. ボイスチャンネルに入る
2. `/voice join` で Bot を招待
3. プロファイルを設定（デフォルトが未設定の場合）:
   ```
   /voice profiles
   /voice profile name:yourname
   ```
4. TTS を再生:
   ```
   /voice speak prompt:こんにちは
   ```

音声が再生されれば正常。

5. 退出:
   ```
   /voice leave
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

**TTS サーバーに接続できない**
```bash
# Discord から
/bot tts-server action:start
# または手動で
cd tts-server/Qwen3-TTS-Openai-Fastapi && .venv/bin/uvicorn main:app --port 8880
```

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
