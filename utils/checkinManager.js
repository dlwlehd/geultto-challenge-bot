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

        // 매 10분마다 보류 중인 시간 설정 확인
        setInterval(() => {
            this.checkAndApplyPendingResets();
        }, 10 * 60 * 1000); // 10분

        // 초기화 시 즉시 한 번 실행
        this.checkAndApplyPendingResets();
    }

    async checkAndApplyPendingResets() {
        try {
            const pendingResets = await this.loadPendingResets();
            const resetTimes = await this.loadResetTimes();
            const now = Date.now();
            let hasChanges = false;

            for (const [userId, pending] of Object.entries(pendingResets)) {
                if (now >= pending.effectiveTime) {
                    // reset_times에 적용
                    resetTimes[userId] = {
                        hour: pending.hour,
                        lastUpdate: pending.lastUpdate,
                        appliedAt: now
                    };

                    // pending_resets에서 제거
                    delete pendingResets[userId];
                    hasChanges = true;

                    logger.info(`자동 시간 설정 적용 완료 - 사용자: ${userId}, 시간: ${pending.hour}`);
                }
            }

            if (hasChanges) {
                await this.saveResetTimes(resetTimes);
                await this.savePendingResets(pendingResets);
                logger.info('보류 중인 시간 설정 업데이트 완료');
            }
        } catch (error) {
            logger.error('보류 중인 시간 설정 처리 중 오류 발생:', error);
        }
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
        try {
            const pendingResets = await this.loadPendingResets();
            const resetTimes = await this.loadResetTimes();

            // pending_resets에서 시간을 체크할 때 KST로 변환하여 비교
            if (pendingResets[userId]) {
                const {hour, effectiveTime, lastUpdate} = pendingResets[userId];
                const now = Date.now();
                const utc = now + new Date().getTimezoneOffset() * 60_000;
                const kst = utc + 9 * 60 * 60 * 1000;

                if (kst >= effectiveTime + (9 * 60 * 60 * 1000)) {  // KST 기준으로 비교
                    // reset_times에 저장할 때 기존 데이터 보존
                    resetTimes[userId] = {
                        hour,
                        lastUpdate,
                        appliedAt: now  // 실제 적용된 시간 기록
                    };
                    await this.saveResetTimes(resetTimes);

                    // pending_resets에서 제거
                    delete pendingResets[userId];
                    await this.savePendingResets(pendingResets);

                    logger.info(`User ${userId} reset hour applied: ${hour}`);
                    return hour;
                }

                // 아직 적용 시간이 되지 않았다면 현재 설정된 시간 반환
                return resetTimes[userId]?.hour ?? 0;
            }

            // pending_resets가 없다면 현재 설정된 시간 반환
            return resetTimes[userId]?.hour ?? 0;
        } catch (error) {
            logger.error(`Error in getUserResetHour for user ${userId}:`, error);
            return 0; // 에러 발생 시 기본값 반환
        }
    }

    async updateUserResetHour(userId, hour) {
        // 1) 지금 시각을 "UTC" 기준 밀리초로 구한다
        const nowUTC = Date.now(); // = new Date().getTime()

        // 2) "지금 시각"을 KST 기준 시간으로 보고 싶다면 +9시간
        const nowKST = nowUTC + (9 * 60 * 60 * 1000);
        const nowKSTDate = new Date(nowKST);

        // 3) KST로 보았을 때 "내일"로 설정
        nowKSTDate.setDate(nowKSTDate.getDate() + 1);
        nowKSTDate.setHours(hour, 0, 0, 0); // 예: hour=6

        // 4) 다시 UTC로 환산(빼기 9시간)
        const effectiveTime = nowKSTDate.getTime();

        // 저장
        const pendingResets = await this.loadPendingResets();
        pendingResets[userId] = {
            hour,
            lastUpdate: nowUTC,  // 현재 UTC 시각
            effectiveTime        // 다음 날 KST hour시를 UTC로 저장
        };
        await this.savePendingResets(pendingResets);

        return {
            previousHour: await this.getUserResetHour(userId),
            newHour: hour,
            effectiveDate: new Date(effectiveTime) // <-- 이건 UTC Date 객체
        };
    }

    async getTodayByUser(userId) {
        try {
            // 1) 현재 시각 (UTC) 및 KST 변환
            const nowUTC = Date.now();            // UTC epoch milliseconds
            const nowKST = nowUTC + 9 * 60 * 60 * 1000;
            const nowKSTDate = new Date(nowKST);

            // 2) 체크인 내역 및 보류 중인 시간 변경(pendingReset) 조회
            const checkins = await this.loadCheckins();
            const userCheckins = checkins[userId] || [];
            const todayCheckin = userCheckins[0]; // 가장 최근 체크인

            const pendingResets = await this.loadPendingResets();
            const pendingReset = pendingResets[userId];

            // 디버깅용 로그
            logger.debug(`[getTodayByUser] userId=${userId}`);
            logger.debug(`[getTodayByUser] nowKSTDate=${nowKSTDate.toISOString()}`);
            logger.debug(`[getTodayByUser] pendingReset=`, pendingReset);
            logger.debug(`[getTodayByUser] latest checkin=`, todayCheckin);

            // 3) 보류 중인 변경이 있고, 아직 적용 시점(effectiveTime)이 지나지 않았다면
            //    => 기존 체크인 날짜(todayCheckin.date)를 그대로 사용
            //    (단, todayCheckin이 없으면 어차피 반환할 이전 날짜가 없으므로 넘어감)
            if (pendingReset) {
                // pendingReset.effectiveTime 은 "UTC 기준 타임스탬프"라 가정
                if (todayCheckin && nowUTC < pendingReset.effectiveTime) {
                    logger.debug(`[getTodayByUser] Pending reset not yet effective. Returning old checkin date: ${todayCheckin.date}`);
                    return todayCheckin.date;
                }
            }

            // 4) 보류 변경이 없거나, 이미 적용 시점이 지났다면:
            //    => 현재 설정된 resetHour 기준으로 '오늘 날짜' 판별
            const resetHour = await this.getUserResetHour(userId);
            logger.debug(`[getTodayByUser] resetHour=${resetHour}`);

            // (1) 현재 KST 시각의 Hour < resetHour
            //     => 오늘 리셋시간이 아직 오지 않았으므로, "어제 날짜" 사용
            if (nowKSTDate.getUTCHours() < resetHour) {
                const yesterdayKST = new Date(nowKST - 24 * 60 * 60 * 1000);
                const yesterdayStr = yesterdayKST.toISOString().split('T')[0];
                logger.debug(`[getTodayByUser] nowKST hour=${nowKSTDate.getUTCHours()} < resetHour=${resetHour}, so return yesterday=${yesterdayStr}`);
                return yesterdayStr;
            }

            // (2) 그렇지 않다면 오늘 날짜
            const todayStr = nowKSTDate.toISOString().split('T')[0];
            logger.debug(`[getTodayByUser] Returning today=${todayStr}`);
            return todayStr;

        } catch (error) {
            // 5) 에러 시 처리
            logger.error('[getTodayByUser] Error:', error);
            // 안전장치로, "현재 KST 기준 날짜" 반환
            const fallbackKST = Date.now() + 9 * 60 * 60 * 1000;
            const fallbackStr = new Date(fallbackKST).toISOString().split('T')[0];
            return fallbackStr;
        }
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

    async canUpdateResetHour(userId) {
        try {
            const resetTimes = await this.loadResetTimes();
            const pendingResets = await this.loadPendingResets();

            // 1) 먼저 보류 중인 변경이 있는지 확인
            //    - 이미 pendingResets[userId]가 있다면 아직 적용되지 않은 변경이 존재한다는 의미
            if (pendingResets[userId]) {
                return {
                    canUpdate: false,
                    reason: '대기 중인 시간 변경이 이미 존재합니다.'
                };
            }

            // 2) 최근 변경 이력 확인 (3일 이내 변경 불가)
            const lastUpdate = resetTimes[userId]?.lastUpdate;
            const now = Date.now();

            if (lastUpdate && now - lastUpdate < 3 * 24 * 60 * 60 * 1000) {
                const nextAvailable = new Date(lastUpdate + 3 * 24 * 60 * 60 * 1000);
                return {
                    canUpdate: false,
                    nextAvailable
                };
            }

            // 3) 위 조건들을 모두 통과하면 변경 가능
            return {
                canUpdate: true
            };
        } catch (error) {
            logger.error('Error in canUpdateResetHour:', error);
            // 에러 상황에서는 일단 막아두거나, 원하는 로직대로 처리
            return {
                canUpdate: false,
                reason: '오류가 발생했습니다.'
            };
        }
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

    async getCheckinIndex(userId, targetDate) {
        try {
            const checkins = await this.loadCheckins();
            const userCheckins = checkins[userId] || [];

            // 날짜를 내림차순으로 정렬
            const sortedCheckins = [...userCheckins].sort((a, b) => {
                return new Date(b.date).getTime() - new Date(a.date).getTime();
            });

            // 대상 날짜의 인덱스를 찾아서 반환 (1부터 시작)
            const index = sortedCheckins.findIndex(checkin => checkin.date === targetDate);

            // 찾지 못했거나 인덱스가 음수인 경우 0 반환
            if (index === -1) {
                return 0;
            }

            // 전체 체크인 수에서 인덱스를 빼서 반환 (최신 날짜가 가장 큰 숫자를 가지도록)
            return sortedCheckins.length - index;
        } catch (error) {
            logger.error(`체크인 인덱스 계산 중 오류 발생 (사용자: ${userId}, 날짜: ${targetDate}):`, error);
            return 0;
        }
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