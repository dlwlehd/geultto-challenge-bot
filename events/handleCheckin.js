import {
  ActionRowBuilder,
  Events,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { checkinManager } from "../utils/checkinManager.js";
import { logger } from "../utils/logger.js";
import { CHECKIN_CHANNEL_ID } from "../config/config.js";

function formatCheckinContent(tasks) {
  // 숫자 이모지 매핑
  const numberEmojis = [
    "1️⃣",
    "2️⃣",
    "3️⃣",
    "4️⃣",
    "5️⃣",
    "6️⃣",
    "7️⃣",
    "8️⃣",
    "9️⃣",
    "🔟",
  ];

  return tasks
    .map(
      (task, index) =>
        `${numberEmojis[index]} \t ${task.content} \t ${
          task.completed ? "✅" : "⬜"
        }`,
    )
    .join("\n\n");
}

// 체크인 Embed 생성 함수
async function createCheckinEmbed(
  checkin,
  user,
  isEdit = false,
  isPastDate = false,
) {
  const totalTasks = checkin.tasks.length;
  const completedTasks = checkin.tasks.filter((task) => task.completed).length;
  const progressPercent =
    totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(1) : 0;

  // 진행도 바
  const progressBarLength = 10;
  const filledBars = Math.round((progressPercent / 100) * progressBarLength);
  const progressBar =
    "🔳".repeat(filledBars) + "⬜".repeat(progressBarLength - filledBars);

  const [year, month, day] = checkin.date.split("-");
  // 정수 변환(+month)로 앞자리 0 제거
  const dateString = `${+month}/${+day}`;

  // 누적 체크인 개수
  let checkinNumber;
  if (isPastDate) {
    // 예: 어제처럼 과거 체크인일 경우 "연대기상 몇 번째"
    checkinNumber = await checkinManager.getCheckinIndex(user.id, checkin.date);
  } else {
    // 오늘 체크인의 경우 "전체 체크인 개수"
    checkinNumber = await checkinManager.getCheckinCount(user.id);
  }

  // checkinNumber가 -1이면, 계산에 실패했을 때 예외처리를 할 수도 있음
  if (checkinNumber < 1) {
    checkinNumber = "?";
  }

  const embed = new EmbedBuilder()
    .setColor(isEdit ? 0x3498db : 0x2ecc71)
    .setAuthor({
      name: user.username,
      iconURL: user.displayAvatarURL(),
    })
    .setTitle(`${checkinNumber} 번째 체크인 (${dateString}) ✨`)
    .addFields(
      {
        name: "진행률",
        value: `${progressBar} ${progressPercent}%\n`,
        inline: false,
      },
      {
        name: "할 일 목록",
        value: formatCheckinContent(checkin.tasks),
        inline: false,
      },
    )
    .setTimestamp();

  return embed;
}

// Slash 명령어 목록
export const commands = [
  new SlashCommandBuilder()
    .setName("checkin")
    .setDescription("오늘의 할 일을 등록합니다."),
  new SlashCommandBuilder()
    .setName("checkin-today")
    .setDescription("오늘의 체크인 현황을 확인합니다."),
  new SlashCommandBuilder()
    .setName("checkin-complete")
    .setDescription("할 일을 완료 처리합니다.")
    .addIntegerOption((option) =>
      option
        .setName("number")
        .setDescription("완료할 할 일 번호")
        .setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("checkin-cancel")
    .setDescription("할 일 완료를 취소합니다.")
    .addIntegerOption((option) =>
      option
        .setName("number")
        .setDescription("취소할 할 일 번호")
        .setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("checkin-list")
    .setDescription("전체 체크인 기록을 확인합니다."),
  new SlashCommandBuilder()
    .setName("checkin-edit")
    .setDescription("오늘의 체크인을 수정합니다."),
  new SlashCommandBuilder()
    .setName("checkin-recent")
    .setDescription("오늘을 제외한 가장 최근의 체크인 정보를 확인합니다."),
];

export function handleCheckin(client) {
  // 체크인 명령어 처리
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;

    try {
      switch (commandName) {
        /**
         * 1. /checkin
         *   - 모달을 띄워서 "오늘의 할 일" 입력
         *   - 아직은 체크인을 "생성"하지 않고, 모달 제출 시점에 생성
         */
        case "checkin":
          const existingTodayCheckin = await checkinManager.getTodayCheckin(
            interaction.user.id,
          );
          if (existingTodayCheckin) {
            await interaction.reply({
              content:
                "오늘의 체크인이 이미 존재합니다.\n체크인을 수정하시려면 `/checkin-edit` 명령어를 사용해주세요.",
              ephemeral: true,
            });
            return;
          }
          const modal = new ModalBuilder()
            .setCustomId("checkin-modal")
            .setTitle("오늘의 할 일");

          // 기본 5개의 할 일 입력 필드 생성
          for (let i = 1; i <= 5; i++) {
            const placeholders = [
              "학습 경험치 150XP 달성하기",
              "완전 탐색 3단원 2문제 풀기",
              "질문 답변 1회 하기",
              "책 읽기",
              "블로그 작성하기",
            ];

            const taskInput = new TextInputBuilder()
              .setCustomId(`task-${i}`)
              .setLabel(`할 일 ${i}`)
              .setStyle(TextInputStyle.Short)
              .setRequired(i === 1) // 첫 번째 할 일만 필수
              .setPlaceholder(placeholders[(i - 1) % placeholders.length]);

            const actionRow = new ActionRowBuilder().addComponents(taskInput);
            modal.addComponents(actionRow);
          }

          await interaction.showModal(modal);
          break;

        /**
         * 2. /checkin-today
         *   - 오늘의 체크인 현황을 Embed 형태로 보여줌
         */
        case "checkin-today":
          const todayCheckin = await checkinManager.getTodayCheckin(
            interaction.user.id,
          );
          if (!todayCheckin) {
            await interaction.reply("오늘 등록된 체크인이 없습니다.");
            return;
          }

          const embedToday = await createCheckinEmbed(
            todayCheckin,
            interaction.user,
            false,
          );
          await interaction.reply({ embeds: [embedToday] });
          break;

        /**
         * 3. /checkin-complete 또는 /checkin-cancel
         *   - 할 일을 완료/미완료 처리 (toggle)
         *   - 이후 모든 할 일이 완료되었는지 확인 -> 전부 완료면 체크인 채널에 메시지 전송
         */
        case "checkin-complete":
        case "checkin-cancel":
          const taskId = interaction.options.getInteger("number");

          // 현재 체크인 정보 가져오기
          const currentCheckin = await checkinManager.getTodayCheckin(
            interaction.user.id,
          );

          if (!currentCheckin) {
            await interaction.reply("오늘 등록된 체크인이 없습니다.");
            return;
          }

          // 해당 작업이 존재하는지 확인
          const targetTask = currentCheckin.tasks.find(
            (task) => task.id === taskId,
          );
          if (!targetTask) {
            await interaction.reply("해당하는 할 일을 찾을 수 없습니다.");
            return;
          }

          // 현재 상태에 따라 처리
          if (interaction.commandName === "checkin-complete") {
            if (targetTask.completed) {
              await interaction.reply("이미 완료된 작업입니다.");
              return;
            }
          } else if (interaction.commandName === "checkin-cancel") {
            if (!targetTask.completed) {
              await interaction.reply("이미 완료되지 않은 작업입니다.");
              return;
            }
          }

          // 상태 토글
          const updatedTask = await checkinManager.toggleTaskComplete(
            interaction.user.id,
            taskId,
          );

          if (!updatedTask) {
            await interaction.reply("작업 상태를 변경할 수 없습니다.");
            return;
          }

          // 변경된 체크인 정보 다시 가져오기
          const updatedCheckin = await checkinManager.getTodayCheckin(
            interaction.user.id,
          );
          const statusEmbed = await createCheckinEmbed(
            updatedCheckin,
            interaction.user,
            true,
          );

          // 현재 채널에 상태 업데이트 응답
          await interaction.reply({ embeds: [statusEmbed] });

          // 모든 할 일이 완료되었는지 확인
          const allCompleted = updatedCheckin.tasks.every(
            (task) => task.completed,
          );
          if (allCompleted) {
            const checkinChannel =
              await client.channels.fetch(CHECKIN_CHANNEL_ID);
            if (checkinChannel) {
              const finalEmbed = await createCheckinEmbed(
                updatedCheckin,
                interaction.user,
                true,
              );

              await checkinChannel.send({
                content: `<@${interaction.user.id}> 님이 오늘의 체크인을 전부 완료했습니다!`,
                embeds: [finalEmbed],
              });
            }
          }
          break;

        /**
         * 4. /checkin-list
         *   - 유저의 모든 체크인 정보를 Markdown 파일 형태로 보여줌
         */
        case "checkin-list":
          const allCheckins = await checkinManager.getAllCheckins(
            interaction.user.id,
          );
          if (allCheckins.length === 0) {
            await interaction.reply({
              content: "체크인 기록이 없습니다.",
              ephemeral: true,
            });
            return;
          }

          const mdContent = allCheckins
            .map((checkin) => {
              const totalTasks = checkin.tasks.length;
              const completedTasks = checkin.tasks.filter(
                (task) => task.completed,
              ).length;
              const progressPercent = (
                (completedTasks / totalTasks) *
                100
              ).toFixed(1);

              const tasks = checkin.tasks
                .map(
                  (task) =>
                    `  - ${task.content} ${task.completed ? "✅" : "⬜"}`,
                )
                .join("\n");

              return `# ${checkin.date} (달성률: ${progressPercent}%)\n${tasks}`;
            })
            .join("\n\n");

          await interaction.reply({
            content: "체크인 기록입니다.",
            files: [
              {
                attachment: Buffer.from(mdContent),
                name: "checkins.md",
              },
            ],
            ephemeral: true,
          });

          break;

        /**
         * 5. /checkin-edit
         *   - 오늘의 체크인을 수정 (모달로 열어서 내용 수정)
         */
        case "checkin-edit":
          const existingCheckin = await checkinManager.getTodayCheckin(
            interaction.user.id,
          );
          if (!existingCheckin) {
            await interaction.reply(
              "오늘 등록된 체크인이 없습니다. 먼저 체크인을 생성해주세요.",
            );
            return;
          }

          const editModal = new ModalBuilder()
            .setCustomId("checkin-edit-modal")
            .setTitle("체크인 수정");

          // 기존 할 일들을 모달에 표시
          existingCheckin.tasks.forEach((task, i) => {
            const taskInput = new TextInputBuilder()
              .setCustomId(`task-${i + 1}`)
              .setLabel(`할 일 ${i + 1}`)
              .setStyle(TextInputStyle.Short)
              .setValue(task.content) // 기존 값을 미리 채움
              .setRequired(i === 0); // 첫 번째 할 일만 필수

            const actionRow = new ActionRowBuilder().addComponents(taskInput);
            editModal.addComponents(actionRow);
          });

          // 5개보다 적다면, 남은 슬롯은 빈 입력 필드로
          for (let i = existingCheckin.tasks.length; i < 5; i++) {
            const taskInput = new TextInputBuilder()
              .setCustomId(`task-${i + 1}`)
              .setLabel(`할 일 ${i + 1}`)
              .setStyle(TextInputStyle.Short)
              .setRequired(false);

            const actionRow = new ActionRowBuilder().addComponents(taskInput);
            editModal.addComponents(actionRow);
          }

          await interaction.showModal(editModal);
          break;

        case "checkin-recent": {
          // 1) "오늘을 제외한 가장 최신 체크인" 가져오기
          const recentCheckin =
            await checkinManager.getRecentCheckinExcludingToday(
              interaction.user.id,
            );

          // 2) 결과가 없으면 안내 메시지 (ephemeral)
          if (!recentCheckin) {
            await interaction.reply({
              content: "해당하는 체크인 기록이 없습니다.",
              ephemeral: true, // 본인만 보이도록
            });
            return;
          }

          // 3) Embed 생성 (기존 createCheckinEmbed 재사용)
          //    - "isEdit"는 false 정도로, 일반 조회
          const embed = await createCheckinEmbed(
            recentCheckin,
            interaction.user,
            false,
          );

          // 4) 본인에게만 (ephemeral) 응답
          await interaction.reply({
            content: "오늘이 아닌 가장 최근 체크인 정보입니다:",
            embeds: [embed],
            ephemeral: true,
          });

          break;
        }
      }
    } catch (error) {
      logger.error("체크인 명령어 처리 중 오류 발생", error);
      await interaction.reply("오류가 발생했습니다. 다시 시도해주세요.");
    }
  });

  /**
   * 모달 제출 처리
   *  - checkin-modal: 새 체크인 생성
   *  - checkin-edit-modal: 오늘의 체크인 수정
   */
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isModalSubmit()) return;

    try {
      // 1) 오늘의 체크인을 새로 생성(checkin-modal)
      if (interaction.customId === "checkin-modal") {
        const tasks = [];
        for (let i = 1; i <= 5; i++) {
          const task = interaction.fields.getTextInputValue(`task-${i}`);
          if (task) tasks.push(task);
        }

        if (tasks.length === 0) {
          await interaction.reply("최소 하나의 할 일을 입력해주세요.");
          return;
        }

        // --- 실제 체크인 생성
        const checkin = await checkinManager.createCheckin(
          interaction.user.id,
          tasks,
        );

        // --- Embed 생성 & 명령어 채널(= 현재 채널)에 응답
        const embed = await createCheckinEmbed(checkin, interaction.user);
        await interaction.reply({ embeds: [embed] });

        // --- [추가] "처음 등록" 순간 => 체크인 채널에도 메시지
        const checkinChannel = await client.channels.fetch(CHECKIN_CHANNEL_ID);
        if (checkinChannel) {
          // 유저 멘션: <@유저ID>
          await checkinChannel.send({
            content: `<@${interaction.user.id}> 님이 **오늘의 체크인**을 등록했습니다!`,
            embeds: [embed],
          });
        }

        // 2) 오늘의 체크인을 수정(checkin-edit-modal)
      } else if (interaction.customId === "checkin-edit-modal") {
        const tasks = [];
        for (let i = 1; i <= 5; i++) {
          const task = interaction.fields.getTextInputValue(`task-${i}`);
          if (task) tasks.push(task);
        }

        if (tasks.length === 0) {
          await interaction.reply("최소 하나의 할 일을 입력해주세요.");
          return;
        }

        const updatedCheckin = await checkinManager.updateTodayCheckin(
          interaction.user.id,
          tasks,
        );

        if (!updatedCheckin) {
          await interaction.reply("체크인 수정 중 오류가 발생했습니다.");
          return;
        }

        const embed = await createCheckinEmbed(
          updatedCheckin,
          interaction.user,
          true,
        );
        await interaction.reply({ embeds: [embed] });

        // 수정 시에는 “처음 등록” 메시지를 보내지 않으므로, 채널 메시지 X
        // (원하시면 추가 가능)
      }
    } catch (error) {
      logger.error("모달 제출 처리 중 오류 발생", error);
      await interaction.reply("오류가 발생했습니다. 다시 시도해주세요.");
    }
  });
}
