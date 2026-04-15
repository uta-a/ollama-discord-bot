import {
  ApplicationIntegrationType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  InteractionContextType,
  SlashCommandBuilder,
} from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('利用可能なコマンド一覧を表示する')
  .setContexts(
    InteractionContextType.Guild,
    InteractionContextType.BotDM,
    InteractionContextType.PrivateChannel
  )
  .setIntegrationTypes(
    ApplicationIntegrationType.GuildInstall,
    ApplicationIntegrationType.UserInstall
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const embed = new EmbedBuilder()
    .setTitle('コマンド一覧')
    .setDescription(
      'Bot をユーザーアプリとしてインストールすると DM でも `/ask` `/chat` `/help` が使えます。'
    )
    .setColor(0x5865f2)
    .addFields(
      {
        name: '💬 AI チャット（DM でも使えます）',
        value: [
          '`/ask prompt:` — AI に単発で質問する（履歴なし）',
          '`/chat prompt:` — AI と会話する（履歴あり）',
          '`/chat prompt: reset:true` — 会話履歴をリセットして送信',
          '`/chat prompt: model:` — 使用モデルを切り替えて送信',
        ].join('\n'),
      },
      {
        name: '🔧 Bot 管理（サーバー限定）',
        value: [
          '`/bot status` — Bot の状態を確認する',
          '`/bot models` — 利用可能な AI モデル一覧',
          '`/bot ollama action:` — Ollama サーバーを操作する',
          '`/bot config key:` — サーバー設定を確認・変更する',
        ].join('\n'),
      },
      {
        name: '🎙️ ボイスチャンネル（サーバー限定）',
        value: [
          '`/voice join` — Bot をあなたの VC に参加させる',
          '`/voice leave` — Bot を VC から退出させる',
        ].join('\n'),
      },
      {
        name: '🔊 VOICEVOX 読み上げ（サーバー限定）',
        value: [
          '`/voicevox say text:` — テキストを一度だけ読み上げる',
          '`/voicevox auto speaker:` — このチャンネルで自分の発言を自動読み上げ ON',
          '`/voicevox stop` — 自分の自動読み上げ OFF',
          '`/voicevox auto-all speaker:` — このチャンネルの全員を自動読み上げ ON',
          '`/voicevox stop-all` — 全員読み上げ OFF',
          '`/voicevox profile speaker:` — デフォルトの声（プロファイル）を設定',
          '`/voicevox status` — 現在の VOICEVOX 状態を確認',
        ].join('\n'),
      },
      {
        name: '📖 VOICEVOX 辞書（サーバー限定）',
        value: [
          '`/voicevox dict add surface: pronunciation:` — 読み方を辞書登録',
          '`/voicevox dict list` — 登録済み辞書一覧',
          '`/voicevox dict remove surface:` — 辞書エントリを削除（候補補完あり）',
        ].join('\n'),
      },
      {
        name: '🗣️ キーワード反応（サーバー限定）',
        value: [
          '`/reaction add trigger: response:` — キーワードと返答を登録',
          '`/reaction list` — 登録済み反応一覧',
          '`/reaction remove trigger:` — 反応を削除（候補補完あり）',
        ].join('\n'),
      },
    )
    .setFooter({ text: '/help — コマンド一覧' });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
