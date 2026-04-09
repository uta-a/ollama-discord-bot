#!/usr/bin/env bash
# Qwen3-TTS サーバーのセットアップスクリプト
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Qwen3-TTS サーバーセットアップ ==="

# Qwen3-TTS-Openai-Fastapi をクローン（未クローンの場合）
if [ ! -d "Qwen3-TTS-Openai-Fastapi" ]; then
  echo "→ Qwen3-TTS-Openai-Fastapi をクローンします..."
  git clone https://github.com/groxaxo/Qwen3-TTS-Openai-Fastapi.git
else
  echo "→ Qwen3-TTS-Openai-Fastapi はすでに存在します。スキップします。"
fi

cd Qwen3-TTS-Openai-Fastapi

# Python venv 作成
if [ ! -d ".venv" ]; then
  echo "→ Python 仮想環境を作成します..."
  python3 -m venv .venv
fi

# 依存パッケージインストール
echo "→ 依存パッケージをインストールします（時間がかかる場合があります）..."
.venv/bin/pip install --upgrade pip -q
.venv/bin/pip install -r requirements.txt -q

cd ..

# profiles ディレクトリの確認
mkdir -p profiles/example

echo ""
echo "=== セットアップ完了 ==="
echo ""
echo "次のステップ:"
echo "1. tts-server/profiles/ にボイスプロファイルを追加する"
echo "   例: profiles/myvoice/reference.wav + profiles/myvoice/meta.json"
echo ""
echo "2. .env に TTS_START_CMD を設定する:"
echo "   TTS_START_CMD=cd $SCRIPT_DIR/Qwen3-TTS-Openai-Fastapi && .venv/bin/uvicorn main:app --host 0.0.0.0 --port 8880"
echo ""
echo "3. Discord Bot を起動し、/tts-server start でサーバーを起動する"
