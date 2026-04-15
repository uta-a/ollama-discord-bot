# Discord Bot (Ollama + VOICEVOX)

ローカルの [Ollama](https://ollama.com/) で動作する LLM と、[VOICEVOX](https://voicevox.hiroshiba.jp/) による音声読み上げ機能を Discord のスラッシュコマンドで利用できる Bot。

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
| `/chat prompt:<テキスト>` | メッセージを送る（会話履歴あり） |
| `/chat prompt:<テキスト> file:<ファイル>` | ファイルを添付して送る |
| `/chat prompt:<テキスト> model:<モデル名>` | モデルを切り替えて送る（履歴はリセット） |
| `/chat prompt:<テキスト> reset:True` | 履歴をクリアして送る |

### /voice — ボイスチャンネル

| コマンド | 説明 |
|---------|------|
| `/voice join` | Bot をボイスチャンネルに参加させる |
| `/voice leave` | Bot をボイスチャンネルから退出させる |

### /voicevox — VOICEVOX 読み上げ

| コマンド | 説明 |
|---------|------|
| `/voicevox say text:<テキスト>` | テキストを一回だけ読み上げる |
| `/voicevox say text:<テキスト> speaker:<キャラ> style:<スタイル>` | キャラクター・スタイルを指定して読み上げ |
| `/voicevox auto speaker:<キャラ>` | 自分の自動読み上げを ON にする（以降 `/` なしのメッセージを読み上げ） |
| `/voicevox stop` | 自分の自動読み上げを OFF にする |
| `/voicevox auto-all speaker:<キャラ>` | チャンネル全員の自動読み上げを ON にする |
| `/voicevox stop-all` | チャンネル全員の自動読み上げを OFF にする |
| `/voicevox profile speaker:<キャラ>` | デフォルトの声を設定する（プロファイル保存） |
| `/voicevox dict add surface:<表記> pronunciation:<読み>` | 読み上げ辞書に単語を追加する |
| `/voicevox dict list` | 登録済みの辞書単語一覧を表示する |
| `/voicevox dict remove surface:<表記>` | 辞書から単語を削除する |

**個人モード（auto）**: `/voicevox auto` を実行すると、そのチャンネルで自分が送信したメッセージ（`/` なし）が自動的に読み上げられる。`/voicevox stop` で停止。

**全員モード（auto-all）**: `/voicevox auto-all` を実行すると、そのチャンネルの全員の発言が読み上げられる。声はプロファイル登録済みのユーザーはそれぞれの声、未登録のユーザーはコマンドで指定したフォールバック声を使う。`/voicevox stop-all` で停止。

プロファイルは JSON ファイルに保存されるため、Bot 再起動後も `/voicevox say` でデフォルト話者として使われる。

**辞書機能（dict）**: `/voicevox dict add` で読み仮名を登録すると、以降の読み上げに反映される。辞書はサーバーごとに独立して JSON ファイルに保存される。VOICEVOX インスタンスは単一の辞書しか持てないため、`VOICEVOX_MAX_CONCURRENT=1`（デフォルト）の環境を前提とする。

### /bot — 管理・設定

| コマンド | 説明 |
|---------|------|
| `/bot status` | Bot の状態を表示 |
| `/bot models` | 利用可能な AI モデル一覧を表示 |
| `/bot ollama action:<start/stop>` | Ollama サーバーを起動・停止 |
| `/bot config key:<項目> value:<値>` | サーバー設定を確認・変更 |

### /help — コマンド一覧

`/help` を実行するとカテゴリ別のコマンド一覧が表示されます（自分だけに見える ephemeral 応答）。

## DM・ユーザーアプリとして使う

`/ask` `/chat` `/help` はユーザーアプリとしてアカウントにインストールすると、Bot が参加していないサーバーや**ユーザー間 DM** でも使えます。

1. Discord Developer Portal → アプリ → **Installation** タブで **User Install** を有効化
2. 表示される Install Link から自分のアカウントにインストール
3. `npm run deploy-commands` でグローバル登録（初回のみ）

詳しくは [SETUP.md](./SETUP.md) を参照。

### その他の特徴

- 同時実行制御（LLM: デフォルト 2 件・即時拒否。VOICEVOX: デフォルト 1 件・30 秒待機）
- 2000 文字を超えるレスポンスは `.txt` ファイルとして添付
- 会話セッションは 30 分で自動期限切れ
- ユーザーごとの VOICEVOX プロファイルを JSON ファイルに永続保存

## セットアップ

### 1. 前提条件

- Node.js 16.11 以上
- [Ollama](https://ollama.com/) がインストール済みであること
- Discord Developer アカウント
- ffmpeg（VC 音声再生に必要）
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
4. **Bot** ページの **Privileged Gateway Intents** で **MESSAGE CONTENT INTENT** を ON にする（自動読み上げに必要）
5. 左メニューの **OAuth2** → **Client ID** をコピー（`CLIENT_ID`）
6. **OAuth2 URL Generator** で以下を選択して Bot 招待 URL を生成:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Send Messages`, `Attach Files`, `Connect`, `Speak`
7. 生成した URL でテストサーバーに Bot を招待
8. Discord の **設定 → 詳細設定 → 開発者モード** を有効にする
9. テストサーバーを右クリック → **サーバーIDをコピー**（`GUILD_ID`）

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

# VOICEVOX（VC 機能を使う場合、省略可）
VOICEVOX_HOST=http://127.0.0.1:50021
VOICEVOX_TIMEOUT_MS=60000
VOICEVOX_MAX_CONCURRENT=1
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

### 7. VOICEVOX エンジンの準備（任意）

VC 音声読み上げ（`/voicevox`）を使う場合のみ必要。

**公式デスクトップアプリ（推奨）:**

1. [VOICEVOX 公式サイト](https://voicevox.hiroshiba.jp/) からアプリをダウンロード・インストール
2. アプリを起動する（デフォルトで `http://127.0.0.1:50021` を待ち受ける）

**Docker を使う場合:**

```bash
docker run --rm -p 50021:50021 voicevox/voicevox_engine:cpu-ubuntu20.04-latest
```

起動確認:

```bash
curl http://127.0.0.1:50021/speakers | head -c 100
```

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

**「VOICEVOX エンジンに接続できません」と表示される**
- VOICEVOX デスクトップアプリを起動する
- または `curl http://127.0.0.1:50021/speakers` で疎通確認する

**音声が再生されない**
- ffmpeg がインストールされているか確認: `which ffmpeg`
- Bot に **接続** と **発言** 権限があるか確認

**環境変数エラーで起動しない**
`.env` ファイルに `DISCORD_TOKEN` と `CLIENT_ID` が設定されているか確認する（`GUILD_ID` は任意）。

## 環境変数

| 変数名 | 必須 | デフォルト | 説明 |
|-------|------|-----------|------|
| `DISCORD_TOKEN` | ○ | — | Discord Bot のトークン |
| `CLIENT_ID` | ○ | — | Discord アプリケーションの Client ID |
| `GUILD_ID` | — | — | テストサーバーの ID（`npm run deploy-commands` 実行時に旧 guild コマンドを削除するために使用） |
| `OLLAMA_HOST` | — | `http://127.0.0.1:11434` | Ollama のホスト URL |
| `OLLAMA_MODEL` | — | `gemma4` | デフォルトモデル名 |
| `MAX_CONCURRENT` | — | `2` | 同時処理可能な LLM リクエスト数 |
| `MAX_HISTORY_LENGTH` | — | `20` | 会話履歴の最大メッセージ数 |
| `SESSION_TIMEOUT_MS` | — | `1800000` | 会話セッションの有効期限（ms、30 分）|
| `VOICEVOX_HOST` | — | `http://127.0.0.1:50021` | VOICEVOX エンジンの URL |
| `VOICEVOX_TIMEOUT_MS` | — | `60000` | VOICEVOX API タイムアウト（ms）|
| `VOICEVOX_MAX_CONCURRENT` | — | `1` | VOICEVOX 同時生成リクエスト数上限 |
