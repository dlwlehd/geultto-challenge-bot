import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "./logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getTodayKST() {
  const now = new Date();
  // UTC+9 변환
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000;
  const kstTime = utc + 9 * 60 * 60 * 1000;
  const kstDate = new Date(kstTime);
  return kstDate.toISOString().split("T")[0];
}

function getKSTDateString(offsetDays = 0) {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000;
  const kstTime = utc + 9 * 60 * 60 * 1000;
  // offsetDays 만큼 일수를 더하거나 빼기
  const adjustedTime = kstTime + offsetDays * 24 * 60 * 60 * 1000;
  const kstDate = new Date(adjustedTime);

  // YYYY-MM-DD 형태
  return kstDate.toISOString().split("T")[0];
}

class CheckinManager {
  constructor() {
    this.dataDir = path.join(__dirname, "../data");
    this.checkinFile = path.join(this.dataDir, "checkins.json");
    this.ensureDataDirectory();
  }

  async ensureDataDirectory() {
    try {
      // data 디렉토리 확인 및 생성
      try {
        await fs.access(this.dataDir);
      } catch {
        await fs.mkdir(this.dataDir, { recursive: true });
        logger.info("데이터 디렉토리 생성됨");
      }

      // checkins.json 파일 확인 및 초기화
      try {
        await fs.access(this.checkinFile);
        // 파일이 존재하면 내용 검증
        const content = await fs.readFile(this.checkinFile, "utf8");
        if (!content || content.trim() === "") {
          throw new Error("Empty file");
        }
        JSON.parse(content); // 유효한 JSON인지 검증
      } catch {
        // 파일이 없거나, 비어있거나, 잘못된 JSON이면 초기화
        await this.saveCheckins({});
        logger.info("체크인 파일 초기화됨");
      }
    } catch (error) {
      logger.error("데이터 디렉토리 초기화 중 오류", error);
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
      // 파일이 손상된 경우 초기화
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

  async getYesterdayCheckin(userId) {
    const checkins = await this.loadCheckins();

    // 한국 시간으로 "어제" 날짜
    const yesterday = getKSTDateString(-1);

    if (!checkins[userId]) {
      return null;
    }

    const yesterdayCheckin = checkins[userId].find(
      (checkin) => checkin.date === yesterday,
    );

    return yesterdayCheckin || null;
  }

  async getCheckinIndex(userId, date) {
    // 모든 체크인 데이터를 불러옵니다.
    const checkins = await this.loadCheckins();
    if (!checkins[userId]) {
      return -1; // 해당 유저의 기록이 없는 경우
    }

    // 유저의 체크인 배열
    // 주의: createCheckin 시점에 checkins[userId].unshift(newCheckin)을 하셨다면
    // 0번 인덱스가 가장 "최근" 체크인입니다.
    const userCheckins = checkins[userId];

    // 이 배열에서 'date'가 일치하는 체크인의 인덱스(0-based)를 찾습니다.
    const idx = userCheckins.findIndex((c) => c.date === date);
    if (idx === -1) {
      // 해당 날짜의 체크인이 없는 경우
      return -1;
    }

    // "배열의 0번 인덱스가 가장 최신"이라면,
    // 실제로는 (전체개수 - idx) 번째가 "연대기상" 번호가 됩니다.
    // 예: 전체 체크인이 5개면,
    //     idx=0 → 최신 체크인 (5번째)
    //     idx=4 → 가장 오래된 체크인 (1번째)
    const totalCount = userCheckins.length;
    const chronologicalOrder = totalCount - idx;

    return chronologicalOrder;
  }

  async getRecentCheckinExcludingToday(userId) {
    // 1) 전체 체크인 데이터 불러오기
    const checkins = await this.loadCheckins();
    if (!checkins[userId]) {
      return null;
    }

    // 2) 유저의 체크인 배열 (가장 앞쪽이 최신)
    const userCheckins = checkins[userId];

    // 3) 한국 시간(혹은 UTC)을 사용 중이시라면, 그 함수에 맞춰 "오늘 날짜"를 구해주세요.
    //    여기서는 간단히 "YYYY-MM-DD" 형태로 getTodayKST()를 사용한다고 가정
    const today = getTodayKST();
    // (만약 그냥 new Date().toISOString().split("T")[0] 쓰신다면 그에 맞춰 수정)

    // 4) "오늘 날짜가 아닌" 체크인 중, 배열에서 가장 앞(최신)을 찾는다.
    //    unshift로 쌓인 경우, userCheckins[0] 이 제일 최신이므로
    //    find()를 써서 순회 중 첫 번째로 발견되는 녀석을 반환
    const recentExcludingToday = userCheckins.find(
      (checkin) => checkin.date !== today,
    );

    // 5) 있으면 반환, 없으면 null
    return recentExcludingToday || null;
  }

  async createCheckin(userId, tasks) {
    logger.info(`체크인 생성 시도: ${userId}`);
    const checkins = await this.loadCheckins();

    if (!checkins[userId]) {
      checkins[userId] = [];
    }

    // [기존] const today = new Date().toISOString().split('T')[0];
    // [변경] 한국 시간 기준
    const today = getTodayKST();

    // 이미 오늘 체크인이 있는지 확인
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
      // 이미 있으면 업데이트
      checkins[userId][todayIndex] = newCheckin;
    } else {
      // 없으면 새로 추가
      checkins[userId].unshift(newCheckin);
    }

    await this.saveCheckins(checkins);
    logger.info(`체크인 생성 완료: ${userId}`);
    return newCheckin;
  }

  async getTodayCheckin(userId) {
    logger.info(`오늘의 체크인 조회: ${userId}`);
    const checkins = await this.loadCheckins();

    // [변경]
    const today = getTodayKST();

    if (!checkins[userId]) {
      logger.info(`${userId}의 체크인 데이터가 없습니다.`);
      return null;
    }

    const todayCheckin = checkins[userId].find(
      (checkin) => checkin.date === today,
    );
    if (!todayCheckin) {
      logger.info(`${userId}의 오늘 체크인이 없습니다.`);
      return null;
    }

    return todayCheckin;
  }

  async toggleTaskComplete(userId, taskId) {
    logger.info(`작업 상태 토글: ${userId}, 작업 번호: ${taskId}`);
    const checkins = await this.loadCheckins();

    // [변경]
    const today = getTodayKST();

    const todayCheckin = checkins[userId]?.find(
      (checkin) => checkin.date === today,
    );
    if (!todayCheckin) {
      logger.error("오늘의 체크인을 찾을 수 없음");
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

    // [변경]
    const today = getTodayKST();

    if (!checkins[userId]) {
      logger.error("사용자의 체크인 데이터가 없음");
      return null;
    }

    const todayIndex = checkins[userId].findIndex(
      (checkin) => checkin.date === today,
    );
    if (todayIndex === -1) {
      logger.error("오늘의 체크인을 찾을 수 없음");
      return null;
    }

    // 기존의 tasks
    const existingTasks = checkins[userId][todayIndex].tasks;

    // 새로 들어온 tasks(수정된 할 일 목록)와 비교하며 업데이트
    const updatedTasks = tasks.map((newContent, index) => {
      const oldTask = existingTasks[index];
      if (oldTask && oldTask.content === newContent) {
        // 기존 내용과 동일하면 완료 상태 유지
        return {
          id: index + 1,
          content: newContent,
          completed: oldTask.completed,
        };
      } else {
        // 내용이 달라졌거나, 기존 task가 없다면 미완료
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
}

export const checkinManager = new CheckinManager();
