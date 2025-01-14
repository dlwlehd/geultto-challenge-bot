import {
    ActionRowBuilder,
    Events,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    EmbedBuilder,
    SlashCommandBuilder,
    ButtonBuilder,
    ButtonStyle
} from "discord.js";
import {checkinManager} from "../utils/checkinManager.js";
import {logger} from "../utils/logger.js";
import {CHECKIN_CHANNEL_ID} from "../config/config.js";

function formatCheckinContent(tasks) {
    const numberEmojis = [
        "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"
    ];

    return tasks
        .map((task, index) =>
            `${numberEmojis[index]} \t ${task.content} \t ${task.completed ? "✅" : "⬜"}`
        )
        .join("\n\n");
}

async function createCheckinEmbed(checkin, user, isEdit = false, isPastDate = false) {
    const totalTasks = checkin.tasks.length;
    const completedTasks = checkin.tasks.filter((task) => task.completed).length;
    const progressPercent = totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(1) : 0;

    const progressBarLength = 10;
    const filledBars = Math.round((progressPercent / 100) * progressBarLength);
    const progressBar = "🔳".repeat(filledBars) + "⬜".repeat(progressBarLength - filledBars);

    const [year, month, day] = checkin.date.split("-");
    const dateString = `${+month}/${+day}`;

    let checkinNumber;
    if (isPastDate) {
        checkinNumber = await checkinManager.getCheckinIndex(user.id, checkin.date);
    } else {
        checkinNumber = await checkinManager.getCheckinCount(user.id);
    }

    if (checkinNumber < 1) {
        checkinNumber = "?";
    }

    // 현재 스트릭과 최장 스트릭 계산
    const currentStreak = await checkinManager.calculateStreak(user.id);
    const maxStreak = await checkinManager.calculateMaxStreak(user.id);
    const streakEmoji = currentStreak > 1 ? "🔥" : "⚡";

    // 최장 기록 갱신 여부 체크
    const isNewRecord = currentStreak > 0 && currentStreak >= maxStreak;
    const recordText = isNewRecord ? "🏆 최고 기록 달성중!" : `최고 기록: ${maxStreak}일`;

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
                name: "연속 체크인",
                value: `${streakEmoji} ${currentStreak}일째 진행중\n${recordText}\n`,
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
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName("checkin-cancel")
        .setDescription("할 일 완료를 취소합니다.")
        .addIntegerOption((option) =>
            option
                .setName("number")
                .setDescription("취소할 할 일 번호")
                .setRequired(true)
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
    new SlashCommandBuilder()
        .setName("checkin-timezone")
        .setDescription("체크인 초기화 시간을 설정합니다 (한국 시간 기준).")
        .addIntegerOption((option) =>
            option
                .setName("hour")
                .setDescription("초기화 시각 (0-23시)")
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(23)
        ),
];

export function handleCheckin(client) {
    client.on(Events.InteractionCreate, async (interaction) => {
        if (!interaction.isCommand()) return;

        const {commandName} = interaction;

        try {
            switch (commandName) {
                case "checkin": {
                    const existingTodayCheckin = await checkinManager.getTodayCheckin(
                        interaction.user.id
                    );

                    if (existingTodayCheckin) {
                        await interaction.reply({
                            content: "오늘의 체크인이 이미 존재합니다.\n체크인을 수정하시려면 `/checkin-edit` 명령어를 사용해주세요.",
                            ephemeral: true,
                        });
                        return;
                    }

                    const modal = new ModalBuilder()
                        .setCustomId("checkin-modal")
                        .setTitle("오늘의 할 일");

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
                            .setRequired(i === 1)
                            .setPlaceholder(placeholders[(i - 1) % placeholders.length]);

                        const actionRow = new ActionRowBuilder().addComponents(taskInput);
                        modal.addComponents(actionRow);
                    }

                    await interaction.showModal(modal);
                    break;
                }

                case "checkin-today": {
                    const todayCheckin = await checkinManager.getTodayCheckin(
                        interaction.user.id
                    );

                    if (!todayCheckin) {
                        await interaction.reply("현재 주기에 등록된 체크인이 없습니다.");
                        return;
                    }

                    const embedToday = await createCheckinEmbed(
                        todayCheckin,
                        interaction.user,
                        false
                    );
                    await interaction.reply({embeds: [embedToday]});
                    break;
                }

                case "checkin-complete":
                case "checkin-cancel": {
                    const taskId = interaction.options.getInteger("number");
                    const today = await checkinManager.getTodayByUser(interaction.user.id);
                    const currentCheckin = await checkinManager.getCheckinByDate(
                        interaction.user.id,
                        today
                    );

                    if (!currentCheckin) {
                        await interaction.reply("현재 주기에 등록된 체크인이 없습니다.");
                        return;
                    }

                    const targetTask = currentCheckin.tasks.find(
                        (task) => task.id === taskId
                    );

                    if (!targetTask) {
                        await interaction.reply("해당하는 할 일을 찾을 수 없습니다.");
                        return;
                    }

                    if (commandName === "checkin-complete" && targetTask.completed) {
                        await interaction.reply("이미 완료된 작업입니다.");
                        return;
                    } else if (commandName === "checkin-cancel" && !targetTask.completed) {
                        await interaction.reply("이미 완료되지 않은 작업입니다.");
                        return;
                    }

                    const updatedTask = await checkinManager.toggleTaskComplete(
                        interaction.user.id,
                        taskId
                    );

                    if (!updatedTask) {
                        await interaction.reply("작업 상태를 변경할 수 없습니다.");
                        return;
                    }

                    const updatedCheckin = await checkinManager.getTodayCheckin(
                        interaction.user.id
                    );
                    const statusEmbed = await createCheckinEmbed(
                        updatedCheckin,
                        interaction.user,
                        true
                    );

                    await interaction.reply({embeds: [statusEmbed]});

                    const allCompleted = updatedCheckin.tasks.every(
                        (task) => task.completed
                    );

                    if (allCompleted) {
                        const checkinChannel = await client.channels.fetch(CHECKIN_CHANNEL_ID);
                        if (checkinChannel) {
                            const finalEmbed = await createCheckinEmbed(
                                updatedCheckin,
                                interaction.user,
                                true
                            );

                            await checkinChannel.send({
                                content: `<@${interaction.user.id}> 님이 오늘의 체크인을 전부 완료했습니다!`,
                                embeds: [finalEmbed],
                            });
                        }
                    }
                    break;
                }

                case "checkin-list": {
                    const allCheckins = await checkinManager.getAllCheckins(
                        interaction.user.id
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
                                (task) => task.completed
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
                }

                case "checkin-edit": {
                    const today = await checkinManager.getTodayByUser(interaction.user.id);
                    const existingCheckin = await checkinManager.getCheckinByDate(
                        interaction.user.id,
                        today
                    );

                    if (!existingCheckin) {
                        await interaction.reply(
                            "현재 주기에 등록된 체크인이 없습니다. 먼저 체크인을 생성해주세요."
                        );
                        return;
                    }

                    const editModal = new ModalBuilder()
                        .setCustomId("checkin-edit-modal")
                        .setTitle("체크인 수정");

                    existingCheckin.tasks.forEach((task, i) => {
                        const taskInput = new TextInputBuilder()
                            .setCustomId(`task-${i + 1}`)
                            .setLabel(`할 일 ${i + 1}`)
                            .setStyle(TextInputStyle.Short)
                            .setValue(task.content)
                            .setRequired(i === 0);

                        const actionRow = new ActionRowBuilder().addComponents(taskInput);
                        editModal.addComponents(actionRow);
                    });

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
                }

                case "checkin-recent": {
                    const recentCheckin = await checkinManager.getRecentCheckinExcludingToday(
                        interaction.user.id
                    );

                    if (!recentCheckin) {
                        await interaction.reply({
                            content: "해당하는 체크인 기록이 없습니다.",
                            ephemeral: true
                        });
                        return;
                    }

                    const embed = await createCheckinEmbed(
                        recentCheckin,
                        interaction.user,
                        false,
                        true
                    );

                    await interaction.reply({
                        content: "오늘이 아닌 가장 최근 체크인 정보입니다:",
                        embeds: [embed],
                        ephemeral: true
                    });
                    break;
                }

                case "checkin-timezone": {
                    const hour = interaction.options.getInteger("hour");

                    try {
                        // 먼저 3일 제한 체크
                        const timeCheck = await checkinManager.canUpdateResetHour(interaction.user.id);
                        if (!timeCheck.canUpdate) {
                            const nextAvailableKST = new Date(timeCheck.nextAvailable.getTime() + 9 * 60 * 60 * 1000);
                            const formattedDate = nextAvailableKST.toLocaleDateString('ko-KR', {
                                month: 'long',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: 'numeric'
                            });

                            const restrictionEmbed = new EmbedBuilder()
                                .setColor(0xFF0000)
                                .setTitle('❌ 변경 제한')
                                .setDescription('초기화 시간은 3일에 한 번만 변경할 수 있습니다.')
                                .addFields({
                                    name: '다음 변경 가능 시간',
                                    value: formattedDate
                                });

                            await interaction.reply({
                                embeds: [restrictionEmbed],
                                ephemeral: true
                            });
                            return;
                        }

                        // 3일 제한을 통과한 경우, 현재 설정 확인
                        const currentHour = await checkinManager.getUserResetHour(interaction.user.id);

                        // 확인 버튼으로 진행
                        const confirmRow = new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId(`confirm-timezone-${hour}`)
                                    .setLabel('확인')
                                    .setStyle(ButtonStyle.Primary),
                                new ButtonBuilder()
                                    .setCustomId('cancel-timezone')
                                    .setLabel('취소')
                                    .setStyle(ButtonStyle.Secondary)
                            );

                        const warningEmbed = new EmbedBuilder()
                            .setColor(0xFFA500)
                            .setTitle('⚠️ 체크인 초기화 시간 변경')
                            .setDescription(`현재 설정: 매일 ${currentHour}시\n변경 예정: 매일 ${hour}시`)
                            .addFields(
                                {
                                    name: '주의사항',
                                    value: '다음 초기화부터 새로운 시간이 적용됩니다.'
                                }
                            );

                        await interaction.reply({
                            embeds: [warningEmbed],
                            components: [confirmRow],
                            ephemeral: true
                        });
                    } catch (error) {
                        logger.error("초기화 시간 설정 중 오류 발생", error);
                        await interaction.reply({
                            content: "시간 설정 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
                            ephemeral: true
                        });
                    }
                    break;
                }
            }
        } catch (error) {
            logger.error("체크인 명령어 처리 중 오류 발생", error);
            await interaction.reply({
                content: "오류가 발생했습니다. 다시 시도해주세요.",
                ephemeral: true
            });
        }
    });

    // 모달 제출 처리
    client.on(Events.InteractionCreate, async (interaction) => {
        if (!interaction.isModalSubmit()) return;

        try {
            // 즉시 defer 처리
            await interaction.deferReply();

            if (interaction.customId === "checkin-modal") {
                const tasks = [];
                for (let i = 1; i <= 5; i++) {
                    const task = interaction.fields.getTextInputValue(`task-${i}`);
                    if (task) tasks.push(task);
                }

                if (tasks.length === 0) {
                    await interaction.editReply({
                        content: "최소 하나의 할 일을 입력해주세요.",
                        ephemeral: true
                    });
                    return;
                }

                try {
                    const checkin = await checkinManager.createCheckin(
                        interaction.user.id,
                        tasks,
                    );

                    const embed = await createCheckinEmbed(checkin, interaction.user);
                    await interaction.editReply({ embeds: [embed] });

                    const checkinChannel = await client.channels.fetch(CHECKIN_CHANNEL_ID);
                    if (checkinChannel) {
                        await checkinChannel.send({
                            content: `<@${interaction.user.id}> 님이 **오늘의 체크인**을 등록했습니다!`,
                            embeds: [embed],
                        });
                    }
                } catch (error) {
                    logger.error("체크인 생성 중 오류 발생", error);
                    await interaction.editReply({
                        content: "체크인 생성 중 오류가 발생했습니다.",
                        ephemeral: true
                    });
                }
            } else if (interaction.customId === "checkin-edit-modal") {
                const tasks = [];
                for (let i = 1; i <= 5; i++) {
                    const task = interaction.fields.getTextInputValue(`task-${i}`);
                    if (task) tasks.push(task);
                }

                if (tasks.length === 0) {
                    await interaction.editReply({
                        content: "최소 하나의 할 일을 입력해주세요.",
                        ephemeral: true
                    });
                    return;
                }

                try {
                    const updatedCheckin = await checkinManager.updateTodayCheckin(
                        interaction.user.id,
                        tasks,
                    );

                    if (!updatedCheckin) {
                        await interaction.editReply({
                            content: "체크인 수정 중 오류가 발생했습니다.",
                            ephemeral: true
                        });
                        return;
                    }

                    const embed = await createCheckinEmbed(
                        updatedCheckin,
                        interaction.user,
                        true,
                    );
                    await interaction.editReply({ embeds: [embed] });
                } catch (error) {
                    logger.error("체크인 수정 중 오류 발생", error);
                    await interaction.editReply({
                        content: "체크인 수정 중 오류가 발생했습니다.",
                        ephemeral: true
                    });
                }
            }
        } catch (error) {
            logger.error("모달 제출 처리 중 오류 발생", error);

            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.deferReply({
                        ephemeral: true
                    });
                }

                await interaction.editReply({
                    content: "오류가 발생했습니다. 다시 시도해주세요.",
                    ephemeral: true
                });
            } catch (followUpError) {
                logger.error("에러 응답 처리 중 추가 오류 발생", followUpError);
            }
        }
    });

    // 버튼 클릭 이벤트 처리
    client.on(Events.InteractionCreate, async (interaction) => {
        if (!interaction.isButton()) return;

        try {
            // 시간 변경 확인 버튼
            if (interaction.customId.startsWith('confirm-timezone-')) {
                const hour = parseInt(interaction.customId.split('-')[2]);

                try {
                    const result = await checkinManager.updateUserResetHour(interaction.user.id, hour);
                    const effectiveDate = result.effectiveDate;
                    const formattedDate = effectiveDate.toLocaleDateString('ko-KR', {
                        month: 'long',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: 'numeric'
                    });

                    const successEmbed = new EmbedBuilder()
                        .setColor(0x00FF00)
                        .setTitle('✅ 초기화 시간 변경 예약 완료')
                        .setDescription(
                            `체크인 초기화 시간이 매일 ${hour}시로 변경될 예정입니다.\n` +
                            `(현재 설정: 매일 ${result.previousHour}시)`
                        )
                        .addFields({
                            name: '적용 시점',
                            value: `${formattedDate}부터\n(현재 진행 중인 체크인 주기가 끝난 후)`
                        });

                    await interaction.update({
                        embeds: [successEmbed],
                        components: [],
                        ephemeral: true
                    });
                } catch (error) {
                    logger.error("시간 변경 처리 중 오류 발생", error);
                    await interaction.update({
                        content: "시간 변경 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
                        components: [],
                        ephemeral: true
                    });
                }
            }

            // 취소 버튼
            else if (interaction.customId === 'cancel-timezone') {
                try {
                    const cancelEmbed = new EmbedBuilder()
                        .setColor(0x808080)
                        .setTitle('초기화 시간 변경 취소')
                        .setDescription('변경이 취소되었습니다.');

                    await interaction.update({
                        embeds: [cancelEmbed],
                        components: [],
                        ephemeral: true
                    });
                } catch (error) {
                    logger.error("취소 버튼 처리 중 오류 발생", error);
                    await interaction.update({
                        content: "취소 처리 중 오류가 발생했습니다.",
                        components: [],
                        ephemeral: true
                    });
                }
            }
        } catch (error) {
            logger.error("버튼 이벤트 처리 중 오류 발생", error);
            await interaction.update({
                content: "처리 중 오류가 발생했습니다.",
                components: [],
                ephemeral: true
            });
        }
    });
}