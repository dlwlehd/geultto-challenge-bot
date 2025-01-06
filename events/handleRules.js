import { Events } from "discord.js";
import { RULES_MESSAGE_ID, ROLES } from "../config/config.js";
import { addRole } from "../utils/roleManager.js";
import { logger } from "../utils/logger.js";

export function handleRules(client) {
  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (user.bot) return;

    logger.debug(`리액션 감지됨: ${reaction.message.id}`);

    if (reaction.message.id === RULES_MESSAGE_ID) {
      logger.info(`규칙 동의: ${user.tag}`);
      const guild = reaction.message.guild;
      const member = await guild.members.fetch(user.id);
      await addRole(member, ROLES.NEWBIE);
    }
  });
}
