# Discord Bot (Ollama + Qwen3-TTS)

ローカルの [Ollama](https://ollama.com/) で動作する LLM と、[Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS) による音声読み上げ機能を Discord のスラッシュコマンドで利用できる Bot。

## 機能

### /ask — 単発質問

| コマンド | 説明 |
|---------|------|
| `/ask prompt:<テキスト>` | AI に単発で質問する（履歴なし） |
| `/ask prompt:<テキスト> model:<モデル名>` | モデルを指定して質問 |
| `/ask prompt:<テキスト> file:<ファイル>` | 画像やテキストファイルを添付して質問 |

### /chat — マルチターン会話

| コマンド | 説明 |
|---------|------|
| `/chat send prompt:<テキスト>` | メッセージを送る（会話履歴あり） |
| `/chat send prompt:<テキスト> file:<ファイル>` | ファイルを添付して送る |
| `/chat reset` | 会話履歴をクリア（モデル選択は維持） |
| `/chat model name:<モデル名>` | 使用するモデルを切り替え（履歴はリセット） |

### /voice — ボイスチャンネル・TTS

| コマンド | 説明 |
|---------|------|
| `/voice join` | Bot をボイスチャンネルに参加させる |
| `/voice leave` | Bot をボイスチャンネルから退出させる |
| `/voice speak prompt:<テキスト>` | テキストを音声に変換して読み上げる |
| `/voice profile name:<名前>` | ボイスプロファイルを切り替える |
| `/voice profiles` | 利用可能なボイスプロファイル一覧を表示 |

### /bot — 管理・設定

| コマンド | 説明 |
|---------|------|
| `/bot status` | Bot の状態を表示 |
| `/bot models` | 利用可能な AI モデル一覧を表示 |
| `/bot ollama action:<start/stop>` | Ollama サーバーを起動・停止 |
| `/bot tts-server action:<start/stop/status>` | TTS サーバーを操作 |
| `/bot config key:<項目> value:<値>` | サーバー設定を確認・変更 |

### その他の特徴

- 同時実行制御（LLM: デフォルト 2 件・即時拒否。TTS: デフォルト 1 件・30 秒待機）
- 2000 文字を超えるレスポンスは `.txt` ファイルとして添付
- 会話セッションは 30 分で自動期限切れ
- VC 接続後 5 分無操作で自動退出
- TTS はゼロショットボイスクローン（3 秒の参照音声で声を模倣）

## セットアップ

### 1. 前提条件

- Node.js 16.11 以上
- [Ollama](https://ollama.com/) がインストール済みであること
- Discord Developer アカウント
- ffmpeg（TTS 使用時に必要）
  ```bash
  brew install ffmpeg   # macOS
  apt install ffmpeg    # Ubuntu/Debian
  ```
- Xcode Command Line Tools（macOS、`@discordjs/opus` ビルドに必要）
  ```bash
  xcode-select --install
  ```

### 2. Ollama の準備

```bash
# Ollama を起動
ollama serve

# Gemma4 モデルをダウンロード（初回のみ）
ollama pull gemma4:e2b
ollama pull gemma4:latest

# 利用可能なモデルを確認
ollama list
```

### 3. Discord Bot の作成

1. [Discord Developer Portal](https://discord.com/developers/applications) を開く
2. **New Application** をクリックしてアプリを作成
3. 左メニューの **Bot** → **Reset Token** でトークンをコピー（`DISCORD_TOKEN`）
4. 左メニューの **OAuth2** → **Client ID** をコピー（`CLIENT_ID`）
5. **OAuth2 URL Generator** で以下を選択して Bot 招待 URL を生成:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Send Messages`, `Attach Files`, `Connect`, `Speak`
6. 生成した URL でテストサーバーに Bot を招待
7. Discord の **設定 → 詳細設定 → 開発者モード** を有効にする
8. テストサーバーを右クリック → **サーバーIDをコピー**（`GUILD_ID`）

### 4. 環境変数の設定

`.env` ファイルを作成して値を設定:

```
# Discord
DISCORD_TOKEN=your-bot-token
CLIENT_ID=your-application-client-id
GUILD_ID=your-test-server-id

# Ollama（省略可）
OLLAMA_HOST=http://127.0.0.1:11434
OLLAMA_MODEL=gemma4
MAX_CONCURRENT=2
MAX_HISTORY_LENGTH=20
SESSION_TIMEOUT_MS=1800000

# TTS（VC 機能を使う場合）
TTS_SERVER_HOST=http://127.0.0.1:8880
TTS_START_CMD=cd /path/to/discord-bot/tts-server/Qwen3-TTS-Openai-Fastapi && .venv/bin/uvicorn main:app --host 0.0.0.0 --port 8880
TTS_PROFILES_DIR=./tts-server/profiles
DEFAULT_VOICE_PROFILE=
TTS_TIMEOUT_MS=60000
TTS_MAX_CONCURRENT=1
TTS_SEMAPHORE_WAIT_MS=30000
VOICE_IDLE_TIMEOUT_MS=300000
```

### 5. 依存パッケージのインストール

```bash
npm install
```

### 6. スラッシュコマンドの登録

Discord にスラッシュコマンドを登録する（初回・コマンド変更時に実行）:

```bash
npm run deploy-commands
```

### 7. TTS サーバーのセットアップ（任意）

VC 音声読み上げ機能を使う場合のみ:

```bash
cd tts-server
bash setup.sh
```

詳細は [tts-server/README.md](./tts-server/README.md) を参照。

## 起動

### 開発モード（ファイル変更を自動検知して再起動）

```bash
npm run dev
```

### 本番モード

```bash
npm run build   # TypeScript をコンパイル
npm start       # ビルド済みファイルを実行
```

## npm スクリプト一覧

| コマンド | 説明 |
|---------|------|
| `npm run dev` | 開発モードで Bot を起動（tsx watch）|
| `npm run build` | TypeScript をコンパイルして `dist/` に出力 |
| `npm start` | ビルド済みファイルで Bot を起動 |
| `npm run deploy-commands` | Discord にスラッシュコマンドを登録 |

## ボイスプロファイルの追加

TTS でゼロショットボイスクローンを使うには、参照音声ファイルを配置する:

```
tts-server/profiles/<名前>/
├── meta.json       # プロファイルメタデータ
└── reference.wav   # 3〜10 秒の参照音声（クリアな発話）
```

`meta.json` の例:
```json
{
  "name": "表示名",
  "profile_id": "yourname",
  "ref_audio_filename": "reference.wav",
  "ref_text": "参照音声の内容（正確に書くほど品質が上がる）",
  "language": "ja"
}
```

プロファイル追加後、`/voice profiles` で一覧を確認し `/voice profile name:<名前>` で選択する。

## トラブルシューティング

**「Ollama に接続できません」と表示される**
```bash
ollama serve
# または Discord から /bot ollama action:start
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
`.env` ファイルに `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID` が設定されているか確認する。

## 環境変数

| 変数名 | 必須 | デフォルト | 説明 |
|-------|------|-----------|------|
| `DISCORD_TOKEN` | ○ | — | Discord Bot のトークン |
| `CLIENT_ID` | ○ | — | Discord アプリケーションの Client ID |
| `GUILD_ID` | ○ | — | テストサーバーの ID |
| `OLLAMA_HOST` | — | `http://127.0.0.1:11434` | Ollama のホスト URL |
| `OLLAMA_MODEL` | — | `gemma4` | デフォルトモデル名 |
| `MAX_CONCURRENT` | — | `2` | 同時処理可能な LLM リクエスト数 |
| `MAX_HISTORY_LENGTH` | — | `20` | 会話履歴の最大メッセージ数 |
| `SESSION_TIMEOUT_MS` | — | `1800000` | 会話セッションの有効期限（ms、30 分）|
| `TTS_SERVER_HOST` | — | `http://127.0.0.1:8880` | TTS サーバー URL |
| `TTS_START_CMD` | — | — | TTS サーバー起動コマンド |
| `TTS_STOP_CMD` | — | — | TTS サーバー停止コマンド（省略可）|
| `TTS_PROFILES_DIR` | — | `./tts-server/profiles` | ボイスプロファイルのディレクトリ |
| `DEFAULT_VOICE_PROFILE` | — | — | デフォルトボイスプロファイル名 |
| `TTS_TIMEOUT_MS` | — | `60000` | TTS API タイムアウト（ms）|
| `TTS_MAX_CONCURRENT` | — | `1` | TTS 同時生成リクエスト数上限 |
| `TTS_SEMAPHORE_WAIT_MS` | — | `30000` | TTS セマフォ待機タイムアウト（ms）|
| `VOICE_IDLE_TIMEOUT_MS` | — | `300000` | VC アイドル自動退出（ms、5 分）|
