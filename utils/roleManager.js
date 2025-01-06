// src/utils/roleManager.js
import { logger } from "./logger.js";

export async function addRole(member, roleName) {
  try {
    const role = member.guild.roles.cache.find(
      (role) => role.name === roleName,
    );
    if (!role) {
      logger.error(`${roleName} 역할을 찾을 수 없습니다!`);
      return false;
    }

    await member.roles.add(role);
    logger.info(`${member.user.tag}에게 ${roleName} 역할이 부여되었습니다.`);
    return true;
  } catch (error) {
    logger.error(
      `역할 부여 중 오류 발생: ${member.user.tag}, ${roleName}`,
      error,
    );
    return false;
  }
}

export async function removeRole(member, roleName) {
  try {
    const role = member.guild.roles.cache.find(
      (role) => role.name === roleName,
    );
    if (!role) {
      logger.error(`${roleName} 역할을 찾을 수 없습니다!`);
      return false;
    }

    await member.roles.remove(role);
    logger.info(`${member.user.tag}의 ${roleName} 역할이 제거되었습니다.`);
    return true;
  } catch (error) {
    logger.error(
      `역할 제거 중 오류 발생: ${member.user.tag}, ${roleName}`,
      error,
    );
    return false;
  }
}

export async function hasRole(member, roleName) {
  const role = member.guild.roles.cache.find((role) => role.name === roleName);
  if (!role) {
    logger.error(`${roleName} 역할을 찾을 수 없습니다!`);
    return false;
  }

  return member.roles.cache.has(role.id);
}
