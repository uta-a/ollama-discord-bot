import type { ChatInputCommandInteraction } from 'discord.js';

// discord.js v14 でオプションを追加すると SlashCommandOptionsOnlyBuilder が返るため、
// 実際に使う name と toJSON のみを型として定義する
export interface Command {
  data: { name: string; toJSON: () => object };
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}
