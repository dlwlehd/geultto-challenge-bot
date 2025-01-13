import fs from "fs/promises";
import path from "path";
import {fileURLToPath} from "url";
import {logger} from "./logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getKSTDateString(offsetDays = 0) {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60_000;
    const kstTime = utc + 9 * 60 * 60 * 1000;
    const adjustedTime = kstTime + offsetDays * 24 * 60 * 60 * 1000;
    const kstDate = new Date(adjustedTime);
    return kstDate.toISOString().split("T")[0];
}

export class CheckinManager {
    constructor() {
        this.dataDir = path.join(__dirname, "../data");
        this.checkinFile = path.join(this.dataDir, "checkins.json");
        this.resetTimeFile = path.join(this.dataDir, "reset_times.json");
        this.pendingResetFile = path.join(this.dataDir, "pending_resets.json"); // 새로 추가
        this.ensureDataDirectory();
    }

    async ensureDataDirectory() {
        try {
            // data 디렉토리 확인 및 생성
            try {
                await fs.access(this.dataDir);
            } catch {
                await fs.mkdir(this.dataDir, {recursive: true});
                logger.info("데이터 디렉토리 생성됨");
            }

            // checkins.json 파일 확인 및 초기화
            try {
                await fs.access(this.checkinFile);
                const content = await fs.readFile(this.checkinFile, "utf8");
                if (!content || content.trim() === "") {
                    throw new Error("Empty file");
                }
                JSON.parse(content);
            } catch {
                await this.saveCheckins({});
                logger.info("체크인 파일 초기화됨");
            }

            // reset_times.json 파일 확인 및 초기화
            try {
                await fs.access(this.resetTimeFile);
                const content = await fs.readFile(this.resetTimeFile, "utf8");
                if (!content || content.trim() === "") {
                    throw new Error("Empty file");
                }
                JSON.parse(content);
            } catch {
                await this.saveResetTimes({});
                logger.info("초기화 시간 파일 생성됨");
            }

            try {
                await fs.access(this.pendingResetFile);
                const content = await fs.readFile(this.pendingResetFile, "utf8");
                if (!content || content.trim() === "") {
                    throw new Error("Empty file");
                }
                JSON.parse(content);
            } catch {
                await this.savePendingResets({});
                logger.info("대기중인 초기화 시간 파일 생성됨");
            }
        } catch (error) {
            logger.error("데이터 디렉토리 초기화 중 오류", error);
            throw error;
        }
    }


    async loadPendingResets() {
        try {
            const content = await fs.readFile(this.pendingResetFile, "utf8");
            return JSON.parse(content);
        } catch (error) {
            logger.error("대기중인 초기화 시간 데이터 로드 실패", error);
            await this.savePendingResets({});
            return {};
        }
    }

    async savePendingResets(pendingResets) {
        try {
            await fs.writeFile(
                this.pendingResetFile,
                JSON.stringify(pendingResets, null, 2),
                "utf8"
            );
            logger.info("대기중인 초기화 시간 데이터 저장 완료");
        } catch (error) {
            logger.error("대기중인 초기화 시간 데이터 저장 실패", error);
            throw error;
        }
    }

    async loadCheckins() {
        try {
            const content = await fs.readFile(this.checkinFile, "utf8");
            if (!content || content.trim() === "") {
                logger.warn("체크인 파일이 비어있어 초기화합니다");
                await this.saveCheckins({});
                return {};
            }
            return JSON.parse(content);
        } catch (error) {
            logger.error("체크인 데이터 로드 실패", error);
            await this.saveCheckins({});
            return {};
        }
    }

    async saveCheckins(checkins) {
        try {
            await fs.writeFile(
                this.checkinFile,
                JSON.stringify(checkins, null, 2),
                "utf8",
            );
            logger.info("체크인 데이터 저장 완료");
        } catch (error) {
            logger.error("체크인 데이터 저장 실패", error);
            throw error;
        }
    }

    async loadResetTimes() {
        try {
            const content = await fs.readFile(this.resetTimeFile, "utf8");
            return JSON.parse(content);
        } catch (error) {
            logger.error("초기화 시간 데이터 로드 실패", error);
            await this.saveResetTimes({});
            return {};
        }
    }

    async saveResetTimes(resetTimes) {
        try {
            await fs.writeFile(
                this.resetTimeFile,
                JSON.stringify(resetTimes, null, 2),
                "utf8"
            );
            logger.info("초기화 시간 데이터 저장 완료");
        } catch (error) {
            logger.error("초기화 시간 데이터 저장 실패", error);
            throw error;
        }
    }

    async getUserResetHour(userId) {
        // 먼저 적용 대기중인 시간이 있는지 확인
        const pendingResets = await this.loadPendingResets();
        const resetTimes = await this.loadResetTimes();

        // 현재 시간이 대기중인 시간의 적용 시점 이후라면
        // 대기중인 시간을 실제 시간으로 적용하고 대기 목록에서 제거
        if (pendingResets[userId]) {
            const {hour, effectiveTime} = pendingResets[userId];
            if (Date.now() >= effectiveTime) {
                resetTimes[userId] = {
                    hour,
                    lastUpdate: pendingResets[userId].lastUpdate
                };
                await this.saveResetTimes(resetTimes);

                delete pendingResets[userId];
                await this.savePendingResets(pendingResets);

                return hour;
            }
        }

        return resetTimes[userId]?.hour ?? 0;
    }

    async updateUserResetHour(userId, hour) {
        const pendingResets = await this.loadPendingResets();
        const currentHour = await this.getUserResetHour(userId);

        // 현재 시각을 KST로 변환
        const now = new Date();
        const utc = now.getTime() + now.getTimezoneOffset() * 60_000;
        const kst = utc + 9 * 60 * 60 * 1000;

        // 다음 날 해당 시간으로 설정
        const effectiveDate = new Date(kst);
        effectiveDate.setDate(effectiveDate.getDate() + 1);  // 무조건 다음 날
        effectiveDate.setHours(hour, 0, 0, 0);  // 시간 설정

        pendingResets[userId] = {
            hour,
            lastUpdate: Date.now(),
            effectiveTime: effectiveDate.getTime()
        };

        await this.savePendingResets(pendingResets);
        return {
            previousHour: currentHour,
            newHour: hour,
            effectiveDate: effectiveDate
        };
    }

    async getTodayByUser(userId) {
        const now = new Date();
        const utc = now.getTime() + now.getTimezoneOffset() * 60_000;
        const kst = utc + 9 * 60 * 60 * 1000;
        const kstNow = new Date(kst);

        // 1. 현재 진행중인 체크인이 있는지 확인
        const checkins = await this.loadCheckins();
        const userCheckins = checkins[userId] || [];
        const pendingResets = await this.loadPendingResets();
        const pendingReset = pendingResets[userId];

        if (pendingReset) {
            // 2. 대기 중인 시간 변경이 있고, 현재 진행중인 체크인이 있다면
            const todayCheckin = userCheckins[0]; // 가장 최근 체크인
            if (todayCheckin && Date.now() < pendingReset.effectiveTime) {
                // 3. 예약된 시간 변경 이전까지는 기존 체크인 유지
                return todayCheckin.date;
            }
        }

        // 4. 그 외의 경우 현재 설정된 시간 기준으로 판단
        const resetHour = await this.getUserResetHour(userId);
        if (kstNow.getHours() < resetHour) {
            const yesterday = new Date(kst - 24 * 60 * 60 * 1000);
            return yesterday.toISOString().split("T")[0];
        }

        return kstNow.toISOString().split("T")[0];
    }

    async getTimeUntilNextReset(userId) {
        const resetHour = await this.getUserResetHour(userId);

        const now = new Date();
        const utc = now.getTime() + now.getTimezoneOffset() * 60_000;
        const kst = utc + 9 * 60 * 60 * 1000;
        const kstNow = new Date(kst);

        // 현재 설정된 초기화 시간으로 다음 초기화 시점 계산
        const nextReset = new Date(kst);
        nextReset.setHours(resetHour, 0, 0, 0);

        // 현재 시간이 초기화 시간을 지났다면 다음 날로
        if (kstNow.getHours() >= resetHour) {
            nextReset.setDate(nextReset.getDate() + 1);
        }

        return nextReset.getTime() - kstNow.getTime();
    }

    // checkinManager.js
    async canUpdateResetHour(userId) {
        const resetTimes = await this.loadResetTimes();
        const lastUpdate = resetTimes[userId]?.lastUpdate;
        const now = Date.now();

        if (lastUpdate && now - lastUpdate < 3 * 24 * 60 * 60 * 1000) {
            const nextAvailable = new Date(lastUpdate + 3 * 24 * 60 * 60 * 1000);
            return {
                canUpdate: false,
                nextAvailable
            };
        }

        return {
            canUpdate: true
        };
    }

    async getCheckinByDate(userId, date) {
        logger.info(`체크인 조회: ${userId}, 날짜: ${date}`);
        const checkins = await this.loadCheckins();

        if (!checkins[userId]) {
            logger.info(`${userId}의 체크인 데이터가 없습니다.`);
            return null;
        }

        const checkin = checkins[userId].find(
            (checkin) => checkin.date === date
        );
        if (!checkin) {
            logger.info(`${userId}의 해당 날짜 체크인이 없습니다: ${date}`);
            return null;
        }

        return checkin;
    }

    async getTodayCheckin(userId) {
        const today = await this.getTodayByUser(userId);
        return this.getCheckinByDate(userId, today);
    }

    async createCheckin(userId, tasks) {
        logger.info(`체크인 생성 시도: ${userId}`);
        const checkins = await this.loadCheckins();

        if (!checkins[userId]) {
            checkins[userId] = [];
        }

        const today = await this.getTodayByUser(userId);

        const todayIndex = checkins[userId].findIndex((c) => c.date === today);
        const newCheckin = {
            date: today,
            tasks: tasks.map((task, index) => ({
                id: index + 1,
                content: task,
                completed: false,
            })),
        };

        if (todayIndex !== -1) {
            checkins[userId][todayIndex] = newCheckin;
        } else {
            checkins[userId].unshift(newCheckin);
        }

        await this.saveCheckins(checkins);
        logger.info(`체크인 생성 완료: ${userId}`);
        return newCheckin;
    }

    async toggleTaskComplete(userId, taskId) {
        logger.info(`작업 상태 토글: ${userId}, 작업 번호: ${taskId}`);
        const checkins = await this.loadCheckins();

        const today = await this.getTodayByUser(userId);
        const todayCheckin = checkins[userId]?.find(
            (checkin) => checkin.date === today
        );

        if (!todayCheckin) {
            logger.error("현재 주기의 체크인을 찾을 수 없음");
            return null;
        }

        const task = todayCheckin.tasks.find((t) => t.id === taskId);
        if (!task) {
            logger.error("해당 작업을 찾을 수 없음");
            return null;
        }

        task.completed = !task.completed;
        await this.saveCheckins(checkins);
        logger.info(
            `작업 상태 변경 완료: ${taskId}, ${task.completed ? "완료" : "미완료"}`,
        );
        return task;
    }

    async updateTodayCheckin(userId, tasks) {
        logger.info(`체크인 수정: ${userId}`);
        const checkins = await this.loadCheckins();

        const today = await this.getTodayByUser(userId);
        const todayIndex = checkins[userId]?.findIndex(
            (checkin) => checkin.date === today
        );

        if (!checkins[userId] || todayIndex === -1) {
            logger.error("현재 주기의 체크인을 찾을 수 없음");
            return null;
        }

        const existingTasks = checkins[userId][todayIndex].tasks;
        const updatedTasks = tasks.map((newContent, index) => {
            const oldTask = existingTasks[index];
            if (oldTask && oldTask.content === newContent) {
                return {
                    id: index + 1,
                    content: newContent,
                    completed: oldTask.completed,
                };
            } else {
                return {
                    id: index + 1,
                    content: newContent,
                    completed: false,
                };
            }
        });

        checkins[userId][todayIndex].tasks = updatedTasks;
        await this.saveCheckins(checkins);
        logger.info("체크인 수정 완료");
        return checkins[userId][todayIndex];
    }

    async getAllCheckins(userId) {
        logger.info(`전체 체크인 조회: ${userId}`);
        const checkins = await this.loadCheckins();
        return checkins[userId] || [];
    }

    async getCheckinCount(userId) {
        logger.info(`체크인 개수 조회: ${userId}`);
        const checkins = await this.loadCheckins();
        return checkins[userId]?.length || 0;
    }

    async getRecentCheckinExcludingToday(userId) {
        const checkins = await this.loadCheckins();
        if (!checkins[userId]) {
            return null;
        }

        const userCheckins = checkins[userId];
        const today = await this.getTodayByUser(userId);
        const recentExcludingToday = userCheckins.find(
            (checkin) => checkin.date !== today
        );

        return recentExcludingToday || null;
    }

    async calculateStreak(userId) {
        const checkins = await this.getAllCheckins(userId);
        if (!checkins || checkins.length === 0) return 0;

        let streak = 0;
        const today = await this.getTodayByUser(userId);

        // 날짜를 최신순으로 정렬
        const sortedCheckins = [...checkins].sort((a, b) =>
            new Date(b.date) - new Date(a.date)
        );

        // 오늘 체크인이 있는지 확인
        if (sortedCheckins[0].date !== today) {
            return 0; // 오늘 체크인이 없으면 streak 초기화
        }

        let currentDate = new Date(today);

        for (const checkin of sortedCheckins) {
            const checkinDate = new Date(checkin.date);
            const expectedDate = new Date(currentDate);

            // 날짜가 연속적인지만 확인
            if (checkinDate.getTime() === expectedDate.getTime()) {
                streak++;
                currentDate.setDate(currentDate.getDate() - 1);
            } else {
                break;
            }
        }

        return streak;
    }

    async calculateMaxStreak(userId) {
        const checkins = await this.getAllCheckins(userId);
        if (!checkins || checkins.length === 0) return 0;

        let maxStreak = 0;
        let currentStreak = 0;

        // 날짜를 과거순으로 정렬
        const sortedCheckins = [...checkins].sort((a, b) =>
            new Date(a.date) - new Date(b.date)
        );

        let previousDate = null;

        for (const checkin of sortedCheckins) {
            const checkinDate = new Date(checkin.date);

            if (!previousDate) {
                currentStreak = 1;
            } else {
                const expectedDate = new Date(previousDate);
                expectedDate.setDate(expectedDate.getDate() + 1);

                if (checkinDate.getTime() === expectedDate.getTime()) {
                    currentStreak++;
                } else {
                    currentStreak = 1;
                }
            }

            maxStreak = Math.max(maxStreak, currentStreak);
            previousDate = checkinDate;
        }

        return maxStreak;
    }
}

export const checkinManager = new CheckinManager();