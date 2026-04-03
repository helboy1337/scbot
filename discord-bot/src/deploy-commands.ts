import "dotenv/config";
import { REST, Routes } from "discord.js";
import { buildCommandBodies } from "./commands.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId) {
  console.error("Zet DISCORD_TOKEN en DISCORD_CLIENT_ID in .env");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(token);
const body = buildCommandBodies();

if (guildId) {
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
  console.log(`Slash commands geregistreerd voor guild ${guildId}`);
} else {
  await rest.put(Routes.applicationCommands(clientId), { body });
  console.log("Slash commands globaal geregistreerd (kan tot 1 uur duren)");
}
