import { type RESTPostAPIApplicationCommandsJSONBody, SlashCommandBuilder } from "discord.js";

export function buildCommandBodies(): RESTPostAPIApplicationCommandsJSONBody[] {
  return [
    new SlashCommandBuilder()
      .setName("help")
      .setDescription("Overzicht van Star Citizen mining/refinery commando’s en GitHub-koppeling"),

    new SlashCommandBuilder()
      .setName("bug")
      .setDescription("Meld een bug → GitHub-issue (label auto-agent) voor automatische agent")
      .addStringOption((o) =>
        o.setName("titel").setDescription("Korte titel").setRequired(true).setMaxLength(200),
      )
      .addStringOption((o) =>
        o
          .setName("beschrijving")
          .setDescription("Stappen om te reproduceren, verwacht vs werkelijk")
          .setRequired(true)
          .setMaxLength(4000),
      ),

    new SlashCommandBuilder()
      .setName("idee")
      .setDescription("Feature / website-idee → GitHub-issue met auto-agent")
      .addStringOption((o) =>
        o.setName("titel").setDescription("Korte titel").setRequired(true).setMaxLength(200),
      )
      .addStringOption((o) =>
        o.setName("beschrijving").setDescription("Wat wil je bouwen?").setRequired(true).setMaxLength(4000),
      ),

    new SlashCommandBuilder()
      .setName("profiel")
      .setDescription("RSI-handle gekoppeld aan jouw Discord-account")
      .addSubcommand((s) => s.setName("toon").setDescription("Toon profiel"))
      .addSubcommand((s) =>
        s
          .setName("rsi")
          .setDescription("Stel RSI-handle in")
          .addStringOption((o) =>
            o.setName("handle").setDescription("Jouw RSI handle").setRequired(true).setMaxLength(64),
          ),
      ),

    new SlashCommandBuilder()
      .setName("universum")
      .setDescription("Zoek hemellichamen en locaties")
      .addSubcommand((s) =>
        s
          .setName("zoek")
          .setDescription("Zoek op naam of slug")
          .addStringOption((o) =>
            o.setName("query").setDescription("Zoekterm").setRequired(true).setMaxLength(80),
          ),
      ),

    new SlashCommandBuilder()
      .setName("mining")
      .setDescription("Mining-run loggen en bekijken")
      .addSubcommand((s) =>
        s
          .setName("log")
          .setDescription("Registreer een mining-run (regels: slug:aantal per regel)")
          .addStringOption((o) =>
            o
              .setName("locatie")
              .setDescription("Zoek een locatie (autocomplete)")
              .setRequired(true)
              .setAutocomplete(true),
          )
          .addStringOption((o) =>
            o
              .setName("regels")
              .setDescription('Bijv. quantanium:32 op meerdere regels — leeg + screenshot = OCR')
              .setRequired(false)
              .setMaxLength(4000),
          )
          .addStringOption((o) =>
            o.setName("schip").setDescription("Schip of voertuig").setRequired(false).setMaxLength(120),
          )
          .addStringOption((o) =>
            o.setName("notitie").setDescription("Extra notitie").setRequired(false).setMaxLength(500),
          )
          .addAttachmentOption((o) =>
            o
              .setName("screenshot")
              .setDescription("Screenshot voor OCR (als regels leeg zijn)")
              .setRequired(false),
          ),
      )
      .addSubcommand((s) => s.setName("lijst").setDescription("Laatste mining-runs")),

    new SlashCommandBuilder()
      .setName("raffinage")
      .setDescription("Raffinage-job loggen en bekijken")
      .addSubcommand((s) =>
        s
          .setName("log")
          .setDescription("Screenshot = volledige OCR (inputs/outputs, optioneel locatie & methode)")
          .addStringOption((o) =>
            o
              .setName("locatie")
              .setDescription("Zoek een locatie (autocomplete); optioneel bij screenshot met leesbare naam")
              .setRequired(false)
              .setAutocomplete(true),
          )
          .addStringOption((o) =>
            o
              .setName("methode")
              .setDescription("Bijv. Dinyx, Pyro; optioneel als het op de screenshot staat")
              .setRequired(false)
              .setMaxLength(64),
          )
          .addStringOption((o) =>
            o
              .setName("inputs")
              .setDescription("Inputregels slug:aantal")
              .setRequired(false)
              .setMaxLength(4000),
          )
          .addStringOption((o) =>
            o
              .setName("outputs")
              .setDescription("Outputregels slug:aantal")
              .setRequired(false)
              .setMaxLength(4000),
          )
          .addIntegerOption((o) =>
            o.setName("kosten_auec").setDescription("Kosten in aUEC").setRequired(false).setMinValue(0),
          )
          .addNumberOption((o) =>
            o.setName("duur_uren").setDescription("Duur in uren").setRequired(false).setMinValue(0),
          )
          .addStringOption((o) =>
            o.setName("notitie").setDescription("Extra notitie").setRequired(false).setMaxLength(500),
          )
          .addAttachmentOption((o) =>
            o
              .setName("screenshot")
              .setDescription("Upload: leest inputs/outputs; probeert ook locatie en methode uit de UI")
              .setRequired(false),
          ),
      )
      .addSubcommand((s) => s.setName("lijst").setDescription("Laatste raffinage-jobs")),

    new SlashCommandBuilder()
      .setName("voorraad")
      .setDescription("Inventory per locatie")
      .addSubcommand((s) => s.setName("toon").setDescription("Samenvatting voorraad (top balances)"))
      .addSubcommand((s) =>
        s
          .setName("pas_aan")
          .setDescription("Handmatige correctie (delta SCU)")
          .addStringOption((o) =>
            o
              .setName("locatie")
              .setDescription("Zoek een locatie (autocomplete)")
              .setRequired(true)
              .setAutocomplete(true),
          )
          .addStringOption((o) =>
            o
              .setName("resource")
              .setDescription("Resource slug (bijv. quantanium)")
              .setRequired(true)
              .setAutocomplete(true),
          )
          .addNumberOption((o) =>
            o.setName("delta").setDescription("Positief = erbij, negatief = eraf").setRequired(true),
          )
          .addStringOption((o) =>
            o.setName("notitie").setDescription("Optionele reden").setRequired(false).setMaxLength(200),
          ),
      ),
  ].map((c) => c.toJSON());
}
