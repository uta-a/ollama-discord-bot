import {
  ApplicationIntegrationType,
  ChatInputCommandInteraction,
  InteractionContextType,
  SlashCommandBuilder,
} from 'discord.js';
import { getOllamaStatus, listModels, OllamaError } from '../lib/ollama.js';
import { getSessionCount, getUserModel } from '../lib/conversation.js';
import { startOllama, stopOllama } from '../lib/ollama-process.js';
import { isConnected } from '../lib/voice-manager.js';
import {
  getGuildConfig,
  setGuildConfigValue,
  CONFIG_LABELS,
  type GuildConfig,
} from '../lib/guild-config.js';

export const data = new SlashCommandBuilder()
  .setName('bot')
  .setDescription('Bot の管理・設定')
  .setContexts(InteractionContextType.Guild)
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .addSubcommand((sub) =>
    sub.setName('status').setDescription('Bot の状態を表示する')
  )
  .addSubcommand((sub) =>
    sub.setName('models').setDescription('利用可能な AI モデル一覧を表示する')
  )
  .addSubcommand((sub) =>
    sub
      .setName('ollama')
      .setDescription('Ollama サーバーを操作する')
      .addStringOption((option) =>
        option
          .setName('action')
          .setDescription('実行するアクション')
          .setRequired(true)
          .addChoices(
            { name: 'start — サーバーを起動', value: 'start' },
            { name: 'stop — サーバーを停止', value: 'stop' }
          )
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('config')
      .setDescription('サーバー設定を確認・変更する')
      .addStringOption((option) =>
        option
          .setName('key')
          .setDescription('設定項目')
          .setRequired(true)
          .addChoices({ name: 'voicevox — VOICEVOX 読み上げ有効/無効', value: 'voicevox' })
      )
      .addStringOption((option) =>
        option
          .setName('value')
          .setDescription('設定値（省略すると現在値を表示）')
          .addChoices(
            { name: '有効 (true)', value: 'true' },
            { name: '無効 (false)', value: 'false' }
          )
      )
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: 'このコマンドはサーバー内でのみ使用できます。',
      ephemeral: true,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'status':
      return handleStatus(interaction);
    case 'models':
      return handleModels(interaction);
    case 'ollama':
      return handleOllama(interaction);
    case 'config':
      return handleConfig(interaction);
  }
}

// --- /bot status ---

async function handleStatus(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const { active, capacity, host, defaultModel } = getOllamaStatus();
  const sessionCount = getSessionCount();
  const vcConnected = isConnected(interaction.guildId!);

  const lines = [
    `**Bot ステータス**`,
    ``,
    `**[LLM]**`,
    `処理中リクエスト: ${active} / ${capacity} 件`,
    `アクティブセッション: ${sessionCount} 件`,
    `デフォルトモデル: ${defaultModel}`,
    `Ollama ホスト: ${host}`,
    ``,
    `**[VC]**`,
    `VC 接続: ${vcConnected ? 'このサーバーに接続中' : '未接続'}`,
  ];

  await interaction.editReply(lines.join('\n'));
}

// --- /bot models ---

async function handleModels(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  try {
    const response = await listModels();
    const currentModel = getUserModel(interaction.channelId, interaction.user.id);

    if (response.models.length === 0) {
      await interaction.editReply(
        'Ollama にモデルがありません。`ollama pull <モデル名>` でダウンロードしてください。'
      );
      return;
    }

    const lines = response.models.map((m) => {
      const sizeMB = Math.round(m.size / 1024 / 1024);
      const current = m.name === currentModel || m.name === `${currentModel}:latest` ? ' ← 現在使用中' : '';
      return `• **${m.name}** (${sizeMB} MB)${current}`;
    });

    await interaction.editReply(
      `**利用可能なモデル (${response.models.length} 件)**\n\n${lines.join('\n')}\n\n` +
        `モデルを変える場合は \`/chat prompt:<メッセージ> model:<モデル名>\` を使ってください。`
    );
  } catch (err) {
    const errorMessage =
      err instanceof OllamaError
        ? err.message
        : `予期しないエラーが発生しました: ${err instanceof Error ? err.message : String(err)}`;

    await interaction.editReply(`エラー: ${errorMessage}`);
  }
}

// --- /bot ollama ---

async function handleOllama(interaction: ChatInputCommandInteraction): Promise<void> {
  const action = interaction.options.getString('action', true) as 'start' | 'stop';

  await interaction.deferReply({ ephemeral: true });

  try {
    if (action === 'start') {
      const started = await startOllama();
      await interaction.editReply(
        started ? 'Ollama サーバーを起動しました。' : 'Ollama サーバーはすでに起動しています。'
      );
    } else {
      const stopped = await stopOllama();
      await interaction.editReply(
        stopped ? 'Ollama サーバーを停止しました。' : 'Ollama サーバーはすでに停止しています。'
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await interaction.editReply(`エラー: ${message}`);
  }
}

// --- /bot config ---

async function handleConfig(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const key = interaction.options.getString('key', true) as keyof GuildConfig;
  const rawValue = interaction.options.getString('value');

  const config = getGuildConfig(guildId);

  if (rawValue === null) {
    const lines = (Object.keys(CONFIG_LABELS) as Array<keyof GuildConfig>).map((k) => {
      const label = CONFIG_LABELS[k];
      const val = config[k];
      const display = typeof val === 'boolean' ? (val ? '有効' : '無効') : String(val);
      const current = k === key ? ' ← 選択中' : '';
      return `• **${k}** (${label}): ${display}${current}`;
    });

    await interaction.reply({
      content: [`**サーバー設定**`, '', ...lines].join('\n'),
      ephemeral: true,
    });
    return;
  }

  const newValue = rawValue === 'true';
  setGuildConfigValue(guildId, key, newValue);

  const label = CONFIG_LABELS[key];
  const display = newValue ? '有効' : '無効';
  await interaction.reply({
    content: `設定を更新しました: **${key}** (${label}) = **${display}**`,
    ephemeral: true,
  });
}
