# TTS サーバーセットアップ

Qwen3-TTS を使ったテキスト読み上げ（TTS）サーバーのセットアップ手順です。

## 前提条件

- Python 3.10 以上
- CUDA 対応 GPU
  - 1.7B モデル: 約 6GB VRAM
  - 0.6B モデル: 約 2GB VRAM
- ffmpeg（Discord 音声再生に必要）
  ```
  brew install ffmpeg   # macOS
  apt install ffmpeg    # Ubuntu/Debian
  ```
- Xcode Command Line Tools（macOS の場合、`@discordjs/opus` ビルドに必要）
  ```
  xcode-select --install
  ```

> **注意**: Ollama と TTS サーバーが同一マシンで動く場合、GPU メモリを共有します。
> 両方を同時に使用する際は VRAM に余裕があることを確認してください。

## セットアップ

```bash
cd tts-server
bash setup.sh
```

このスクリプトは以下を行います:
1. [Qwen3-TTS-Openai-Fastapi](https://github.com/groxaxo/Qwen3-TTS-Openai-Fastapi) をクローン
2. Python 仮想環境 (`.venv`) を作成
3. 依存パッケージをインストール

## ボイスプロファイルの追加

各ボイスプロファイルは `profiles/<名前>/` ディレクトリに配置します。

```
profiles/
└── yourname/
    ├── meta.json       # プロファイルメタデータ
    └── reference.wav   # 3〜10秒の参照音声（クリアな発話）
```

### meta.json の形式

```json
{
  "name": "表示名",
  "profile_id": "yourname",
  "ref_audio_filename": "reference.wav",
  "ref_text": "参照音声の内容を文字で書く（正確であるほど品質が上がる）",
  "language": "ja"
}
```

### 参照音声のポイント

- 長さ: 3〜10 秒
- フォーマット: WAV（16-bit PCM, 16kHz または 24kHz 推奨）
- 内容: 背景ノイズなし、自然な発話
- トランスクリプト (`ref_text`) は正確に書く

## 起動

### .env への設定

プロジェクトルートの `.env` に以下を追加:

```
TTS_START_CMD=cd /path/to/discord-bot/tts-server/Qwen3-TTS-Openai-Fastapi && .venv/bin/uvicorn main:app --host 0.0.0.0 --port 8880
TTS_SERVER_HOST=http://127.0.0.1:8880
TTS_PROFILES_DIR=./tts-server/profiles
```

### 手動起動（テスト用）

```bash
cd tts-server/Qwen3-TTS-Openai-Fastapi
.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8880
```

### Discord からの起動

Bot 起動後に:
```
/tts-server start   # 起動
/tts-server stop    # 停止
/tts-server status  # 状態確認
```

## API 確認

```bash
# ヘルスチェック
curl http://localhost:8880/health

# TTS テスト（ゼロショットクローン）
curl -X POST http://localhost:8880/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"model":"tts-1","input":"こんにちは","voice":"clone:yourname","response_format":"wav"}' \
  -o test.wav
```
