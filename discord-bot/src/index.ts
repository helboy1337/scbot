import "dotenv/config";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { handleAutocomplete, handleChatCommand } from "./interaction-handler.js";

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("DISCORD_TOKEN ontbreekt in .env");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once(Events.ClientReady, (c) => {
  console.log(`SC-bot ingelogd als ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isAutocomplete()) {
      await handleAutocomplete(interaction);
      return;
    }
    if (interaction.isChatInputCommand()) {
      await handleChatCommand(interaction);
    }
  } catch (err) {
    console.error("Interaction error:", err);
  }
});

await client.login(token);
