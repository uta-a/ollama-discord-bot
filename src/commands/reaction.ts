import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from 'discord.js';
import {
  MAX_REACTION_ENTRIES,
  getGuildReactions,
  addReaction,
  removeReaction,
  type ReactionEntry,
} from '../lib/reaction-dict.js';

export const data = new SlashCommandBuilder()
  .setName('reaction')
  .setDescription('キーワードに対する Bot の反応を管理する')
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('反応するキーワードと返答を追加する（既存は上書き）')
      .addStringOption((opt) =>
        opt
          .setName('trigger')
          .setDescription('反応するキーワード（1〜64 文字）')
          .setRequired(true)
          .setMaxLength(64)
      )
      .addStringOption((opt) =>
        opt
          .setName('response')
          .setDescription('返答メッセージ（1〜500 文字）')
          .setRequired(true)
          .setMaxLength(500)
      )
  )
  .addSubcommand((sub) =>
    sub.setName('list').setDescription('登録済みの反応一覧を表示する')
  )
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('反応を削除する')
      .addStringOption((opt) =>
        opt
          .setName('trigger')
          .setDescription('削除するキーワード')
          .setRequired(true)
          .setAutocomplete(true)
      )
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: 'このコマンドはサーバー内でのみ利用できます。',
      ephemeral: true,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  switch (subcommand) {
    case 'add':
      return handleAdd(interaction);
    case 'list':
      return handleList(interaction);
    case 'remove':
      return handleRemove(interaction);
  }
}

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  if (sub !== 'remove') {
    await interaction.respond([]);
    return;
  }
  if (!interaction.inGuild()) {
    await interaction.respond([]);
    return;
  }
  const entries = getGuildReactions(interaction.guildId);
  const query = interaction.options.getFocused().toString().toLowerCase();
  const filtered = query
    ? entries.filter(
        (e) =>
          e.trigger.toLowerCase().includes(query) ||
          e.response.toLowerCase().includes(query)
      )
    : [...entries];

  await interaction.respond(
    filtered.slice(0, 25).map((e) => {
      const raw = `${e.trigger} → ${e.response}`;
      const name = raw.length > 97 ? raw.slice(0, 97) + '…' : raw;
      return { name, value: e.trigger };
    })
  );
}

async function handleAdd(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const trigger = interaction.options.getString('trigger', true).trim();
  const response = interaction.options.getString('response', true).trim();

  if (trigger.length === 0) {
    await interaction.editReply('キーワードが空です。1 文字以上入力してください。');
    return;
  }
  if (response.length === 0) {
    await interaction.editReply('返答が空です。1 文字以上入力してください。');
    return;
  }

  const guildId = interaction.guildId!;
  const entry: ReactionEntry = { trigger, response };

  try {
    const result = await addReaction(guildId, entry);
    const verb = result === 'updated' ? '更新' : '登録';
    await interaction.editReply(
      `反応を${verb}しました: \`${trigger}\` → ${response}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await interaction.editReply(message);
  }
}

async function handleList(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const entries = getGuildReactions(guildId);

  if (entries.length === 0) {
    await interaction.reply(
      '登録済みの反応はありません。`/reaction add` で追加できます。'
    );
    return;
  }

  const MAX_DISPLAY = 25;
  const display = entries.slice(0, MAX_DISPLAY);

  const lines = display.map((e) => `• \`${e.trigger}\` → ${e.response}`);
  let displayedCount = lines.length;
  let description = lines.join('\n');

  if (description.length > 4000) {
    const safe: string[] = [];
    for (const line of lines) {
      if ((safe.join('\n') + '\n' + line).length > 4000) break;
      safe.push(line);
    }
    description = safe.join('\n');
    displayedCount = safe.length;
  }

  if (!description) {
    description =
      '（エントリが長すぎて表示できません。`/reaction remove` で削除してください）';
    displayedCount = 0;
  }

  const overflow = entries.length - displayedCount;

  const embed = new EmbedBuilder()
    .setTitle(`キーワード反応辞書（${entries.length} / ${MAX_REACTION_ENTRIES} 件）`)
    .setDescription(description)
    .setColor(0x5865f2);

  if (overflow > 0) {
    embed.setFooter({
      text: `他 ${overflow} 件 — /reaction remove の候補で検索できます`,
    });
  }

  await interaction.reply({ embeds: [embed] });
}

async function handleRemove(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const trigger = interaction.options.getString('trigger', true);
  const guildId = interaction.guildId!;

  const found = await removeReaction(guildId, trigger);
  if (found) {
    await interaction.editReply(`\`${trigger}\` の反応を削除しました。`);
  } else {
    await interaction.editReply(
      `\`${trigger}\` は登録されていません。\`/reaction list\` で登録済みの一覧を確認できます。`
    );
  }
}
