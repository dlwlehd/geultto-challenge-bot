import { Events } from "discord.js";
import { INTRODUCTION_CHANNEL_ID, ROLES } from "../config/config.js";
import { addRole, removeRole } from "../utils/roleManager.js";
import { logger } from "../utils/logger.js";

export function handleIntro(client) {
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    // 들어오는 모든 메시지의 채널 ID를 로깅
    logger.debug(
      `메시지 감지 - 채널 ID: ${message.channel.id}, 설정된 채널 ID: ${INTRODUCTION_CHANNEL_ID}`,
    );

    if (message.channel.id === INTRODUCTION_CHANNEL_ID) {
      logger.info(`자기소개 감지: ${message.author.tag}`);
      const member = message.member;

      // 멤버 정보 확인
      if (!member) {
        logger.error(`멤버 정보를 찾을 수 없음: ${message.author.tag}`);
        return;
      }

      // 현재 역할 상태 확인
      logger.debug(
        `현재 역할 목록: ${Array.from(member.roles.cache.map((role) => role.name))}`,
      );

      try {
        // Newbie 역할 제거 시도
        const removeResult = await removeRole(member, ROLES.NEWBIE);
        logger.debug(`Newbie 역할 제거 결과: ${removeResult}`);

        // 글또 회원 역할 부여 시도
        const success = await addRole(member, ROLES.GEULDDO_MEMBER);
        logger.debug(`글또 회원 역할 부여 결과: ${success}`);

        if (success) {
          logger.info(
            `${member.user.tag}: Newbie 역할 제거 및 글또 회원 역할 부여 완료`,
          );
        }
      } catch (error) {
        logger.error("역할 변경 중 오류 발생:", error);
      }
    }
  });
}
