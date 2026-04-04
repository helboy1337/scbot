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
              .setDescription("Kies uit lijst (database) of vul zelf; optioneel bij screenshot")
              .setRequired(false)
              .setMaxLength(64)
              .setAutocomplete(true),
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
      .addSubcommand((s) => s.setName("lijst").setDescription("Laatste raffinage-jobs"))
      .addSubcommand((s) =>
        s
          .setName("wis")
          .setDescription("Wis al jouw raffinage-jobs (optioneel ook voorraad-tracking)")
          .addStringOption((o) =>
            o
              .setName("bevestig")
              .setDescription("Typ exact: WIS")
              .setRequired(true)
              .setMinLength(3)
              .setMaxLength(3),
          )
          .addBooleanOption((o) =>
            o
              .setName("ook_voorraad")
              .setDescription("Ook alle voorraad en mutaties wissen (mining + raffinage)")
              .setRequired(false),
          ),
      ),

    new SlashCommandBuilder()
      .setName("handel")
      .setDescription("Verkoop- en vraaghints via UEX (community, geen live spel)")
      .addSubcommand((s) =>
        s
          .setName("verkoop")
          .setDescription("Beste terminals om X SCU te verkopen (prijs + vraag niet ‘vol’)")
          .addStringOption((o) =>
            o
              .setName("goederen")
              .setDescription("DB-slug, UEX-naam of code (bijv. stims) — bot zoekt op UEX als niet in DB")
              .setRequired(true)
              .setAutocomplete(true),
          )
          .addNumberOption((o) =>
            o
              .setName("scu")
              .setDescription("Hoeveel SCU je wilt verkopen")
              .setRequired(true)
              .setMinValue(0.01)
              .setMaxValue(1_000_000),
          )
          .addBooleanOption((o) =>
            o
              .setName("alleen_ruime_vraag")
              .setDescription("Strenger: alleen lage/medium vraag (geen High/Very High)")
              .setRequired(false),
          )
          .addIntegerOption((o) =>
            o
              .setName("max_box_scu")
              .setDescription("Grootste cargobox (SCU) — terminal moet die maat in UEX container_sizes hebben")
              .setRequired(false)
              .addChoices(
                { name: "1", value: 1 },
                { name: "2", value: 2 },
                { name: "4", value: 4 },
                { name: "8", value: 8 },
                { name: "16", value: 16 },
                { name: "24", value: 24 },
                { name: "32", value: 32 },
              ),
          ),
      ),

    new SlashCommandBuilder()
      .setName("trade")
      .setDescription("UEX sell hints — same as /handel (English)")
      .addSubcommand((s) =>
        s
          .setName("sell")
          .setDescription("Best terminals to sell X SCU (price + demand not full)")
          .addStringOption((o) =>
            o
              .setName("goederen")
              .setDescription("DB slug, UEX name or code (e.g. stims) — resolves via UEX if not in DB")
              .setRequired(true)
              .setAutocomplete(true),
          )
          .addNumberOption((o) =>
            o
              .setName("scu")
              .setDescription("SCU you want to sell")
              .setRequired(true)
              .setMinValue(0.01)
              .setMaxValue(1_000_000),
          )
          .addBooleanOption((o) =>
            o
              .setName("alleen_ruime_vraag")
              .setDescription("Stricter: low/medium demand only (exclude High/Very High)")
              .setRequired(false),
          )
          .addIntegerOption((o) =>
            o
              .setName("max_box_scu")
              .setDescription("Largest cargo box (SCU) — terminal must list it in UEX container_sizes")
              .setRequired(false)
              .addChoices(
                { name: "1", value: 1 },
                { name: "2", value: 2 },
                { name: "4", value: 4 },
                { name: "8", value: 8 },
                { name: "16", value: 16 },
                { name: "24", value: 24 },
                { name: "32", value: 32 },
              ),
          ),
      ),

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
