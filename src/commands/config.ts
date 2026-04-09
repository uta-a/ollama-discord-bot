import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import {
  getGuildConfig,
  setGuildConfigValue,
  CONFIG_LABELS,
  type GuildConfig,
} from '../lib/guild-config.js';

export const data = new SlashCommandBuilder()
  .setName('config')
  .setDescription('Bot の設定を確認・変更する')
  .addStringOption((option) =>
    option
      .setName('key')
      .setDescription('設定項目')
      .setRequired(true)
      .addChoices({ name: 'tts — 読み上げ有効/無効', value: 'tts' })
  )
  .addStringOption((option) =>
    option
      .setName('value')
      .setDescription('設定値（省略すると現在値を表示）')
      .addChoices(
        { name: '有効 (true)', value: 'true' },
        { name: '無効 (false)', value: 'false' }
      )
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const key = interaction.options.getString('key', true) as keyof GuildConfig;
  const rawValue = interaction.options.getString('value');

  const config = getGuildConfig(guildId);

  // value 省略時 → 現在の全設定を一覧表示
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

  // value あり → 設定を更新
  const newValue = rawValue === 'true';
  setGuildConfigValue(guildId, key, newValue);

  const label = CONFIG_LABELS[key];
  const display = newValue ? '有効' : '無効';
  await interaction.reply({
    content: `設定を更新しました: **${key}** (${label}) = **${display}**`,
    ephemeral: true,
  });
}
