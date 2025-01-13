import {Client, Events, GatewayIntentBits, Partials} from "discord.js";
import express from "express";
import {handleRules} from "./events/handleRules.js";
import {handleIntro} from "./events/handleIntro.js";
import {handleCheckin, commands} from "./events/handleCheckin.js";
import {logger} from "./utils/logger.js";

// Express 서버 설정
const app = express();
const port = 3000;
app.get("/", (req, res) => res.send("Bot is running!"));
app.listen(port, () => console.log(`Server is running at port ${port}`));

// Discord 클라이언트 설정
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.DirectMessages,
    ],
    partials: [
        Partials.Channel,
        Partials.Message,
        Partials.Reaction,
        Partials.User,
        Partials.GuildMember,
    ],
});

// 이벤트 핸들러 등록
handleRules(client);
handleIntro(client);
handleCheckin(client);

// 클라이언트 준비 완료 시 슬래시 명령어 등록
client.once(Events.ClientReady, async (readyClient) => {
    logger.info(`Ready! Logged in as ${readyClient.user.tag}`);

    try {
        await client.application.commands.set(commands);
        logger.info("슬래시 명령어 등록 완료");
    } catch (error) {
        logger.error("슬래시 명령어 등록 실패", error);
    }
});

// 클라이언트 로그인
client.login(process.env.DISCORD_TOKEN);
